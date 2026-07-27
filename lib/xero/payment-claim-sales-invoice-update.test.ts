import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  createAdminSupabaseClient: vi.fn(),
  getXeroInvoice: vi.fn(),
  updateXeroSalesInvoice: vi.fn(),
  getFreshXeroAccessToken: vi.fn(),
  resolvePaymentClaimXeroReadinessContext: vi.fn(),
  evaluatePaymentClaimXeroReadinessSnapshot: vi.fn(),
  buildPaymentClaimXeroPayloadFromResolvedSnapshot: vi.fn(),
  buildPaymentClaimXeroCurrentStateHashFromPayload: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabaseClient: mocks.createAdminSupabaseClient }));
vi.mock("@/lib/xero/client", () => ({
  getXeroInvoice: mocks.getXeroInvoice,
  updateXeroSalesInvoice: mocks.updateXeroSalesInvoice,
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
  buildExistingXeroSalesInvoiceUpdateIdempotencyKey,
  updateExistingXeroSalesInvoice,
} from "./payment-claim-sales-invoice-update";
import { XeroRequestError } from "./client";

type Row = Record<string, unknown>;

function documentRow(overrides: Row = {}): Row {
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
    external_document_id: "invoice-1",
    last_synced_hash: "old-hash",
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
    Contact: { ContactID: "contact-1" },
    Status: "AUTHORISED",
    AmountPaid: 0,
    SubTotal: 900,
    TotalTax: 135,
    Total: 1035,
    ...overrides,
  };
}

describe("existing Payment Claim Xero Sales Invoice update", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolvePaymentClaimXeroReadinessContext.mockResolvedValue({
      snapshot: { claim: {}, accountingDocuments: [{ id: "document-1" }] },
      terminalReadiness: null,
    });
    mocks.evaluatePaymentClaimXeroReadinessSnapshot.mockReturnValue({ ready: true, blockers: [] });
    mocks.buildPaymentClaimXeroPayloadFromResolvedSnapshot.mockReturnValue({
      payload,
      reconciliation: { revenueAmount: 1000, signedRetentionAmount: -100, subtotal: 900, gst: 135, total: 1035 },
    });
    mocks.buildPaymentClaimXeroCurrentStateHashFromPayload.mockReturnValue({ hash: "hash-current", canonicalState: {} });
    mocks.getFreshXeroAccessToken.mockResolvedValue({
      connection: { id: "conn-1", tenant_id: "tenant-1", scope: ["accounting.invoices"] },
      tokenSet: { access_token: "access-token" },
    });
    mocks.getXeroInvoice.mockResolvedValue([xeroInvoice()]);
    mocks.updateXeroSalesInvoice.mockResolvedValue([xeroInvoice()]);
  });

  async function run(document = documentRow()) {
    const admin = createAdmin(document);
    mocks.createAdminSupabaseClient.mockResolvedValue(admin.client);
    const result = await updateExistingXeroSalesInvoice({
      organizationId: "org-1",
      accountingDocumentId: "document-1",
      queuedHash: "hash-current",
      workerJobId: "job-1",
    });
    return { admin, document, result };
  }

  it("updates the exact stored InvoiceID with the Stage 4 payload, then retrieves that ID once", async () => {
    const { result } = await run();
    expect(mocks.getXeroInvoice).toHaveBeenNthCalledWith(1, "access-token", "tenant-1", "invoice-1");
    expect(mocks.updateXeroSalesInvoice).toHaveBeenCalledTimes(1);
    expect(mocks.updateXeroSalesInvoice).toHaveBeenCalledWith({
      accessToken: "access-token",
      tenantId: "tenant-1",
      invoiceId: "invoice-1",
      invoice: payload,
      idempotencyKey: result.idempotencyKey,
    });
    expect(mocks.getXeroInvoice).toHaveBeenNthCalledWith(2, "access-token", "tenant-1", "invoice-1");
    expect(mocks.getXeroInvoice).toHaveBeenCalledTimes(2);
  });

  it("persists verified state and advances the hash only after post-update verification", async () => {
    const { admin, document } = await run();
    expect(admin.updates).toHaveLength(1);
    expect(document).toMatchObject({
      external_document_id: "invoice-1",
      external_document_number: "PC-0042",
      amount_exported: 1035,
      tax_exported: 135,
      raw_external_status: "AUTHORISED",
      normalized_external_status: "awaiting_payment",
      last_synced_hash: "hash-current",
      export_status: "exported",
      last_error_code: null,
      last_error_message: null,
    });
    expect(document.last_synced_at).toBeTruthy();
    expect(document.exported_at).toBe(document.last_synced_at);
    expect(admin.updates[0]).not.toHaveProperty("amount_paid");
    expect(admin.updates[0]).not.toHaveProperty("amount_due");
  });

  it("refuses the update path when InvoiceID is null", async () => {
    const document = documentRow({ external_document_id: null });
    mocks.createAdminSupabaseClient.mockResolvedValue(createAdmin(document).client);
    await expect(updateExistingXeroSalesInvoice({
      organizationId: "org-1", accountingDocumentId: "document-1", queuedHash: "hash-current", workerJobId: "job-1",
    })).rejects.toMatchObject({ code: "create_required" });
    expect(mocks.resolvePaymentClaimXeroReadinessContext).not.toHaveBeenCalled();
    expect(mocks.updateXeroSalesInvoice).not.toHaveBeenCalled();
  });

  it("rejects a cross-organization accounting document server-side", async () => {
    const document = documentRow({ organization_id: "org-other" });
    mocks.createAdminSupabaseClient.mockResolvedValue(createAdmin(document).client);
    await expect(updateExistingXeroSalesInvoice({
      organizationId: "org-1", accountingDocumentId: "document-1", queuedHash: "hash-current", workerJobId: "job-1",
    })).rejects.toMatchObject({ code: "document_not_found" });
    expect(mocks.resolvePaymentClaimXeroReadinessContext).not.toHaveBeenCalled();
    expect(mocks.getXeroInvoice).not.toHaveBeenCalled();
  });

  it("rejects a stale queued hash before token retrieval, Xero calls, or persistence", async () => {
    const document = documentRow();
    const admin = createAdmin(document);
    mocks.createAdminSupabaseClient.mockResolvedValue(admin.client);
    await expect(updateExistingXeroSalesInvoice({
      organizationId: "org-1", accountingDocumentId: "document-1", queuedHash: "old-queued", workerJobId: "job-1",
    })).rejects.toMatchObject({ code: "stale_job" });
    expect(mocks.getFreshXeroAccessToken).not.toHaveBeenCalled();
    expect(mocks.getXeroInvoice).not.toHaveBeenCalled();
    expect(mocks.updateXeroSalesInvoice).not.toHaveBeenCalled();
    expect(admin.updates).toHaveLength(0);
  });

  it("aborts before hash, token, or Xero calls when canonical readiness fails", async () => {
    mocks.createAdminSupabaseClient.mockResolvedValue(createAdmin(documentRow()).client);
    mocks.evaluatePaymentClaimXeroReadinessSnapshot.mockReturnValue({
      ready: false,
      blockers: [{ code: "client_contact_missing", message: "Missing client Xero Contact." }],
    });
    await expect(updateExistingXeroSalesInvoice({
      organizationId: "org-1", accountingDocumentId: "document-1", queuedHash: "hash-current", workerJobId: "job-1",
    })).rejects.toMatchObject({ code: "not_ready" });
    expect(mocks.buildPaymentClaimXeroCurrentStateHashFromPayload).not.toHaveBeenCalled();
    expect(mocks.getFreshXeroAccessToken).not.toHaveBeenCalled();
    expect(mocks.getXeroInvoice).not.toHaveBeenCalled();
  });

  it.each([
    ["connection", { id: "conn-other", tenant_id: "tenant-1", scope: ["accounting.invoices"] }],
    ["tenant", { id: "conn-1", tenant_id: "tenant-other", scope: ["accounting.invoices"] }],
    ["scope", { id: "conn-1", tenant_id: "tenant-1", scope: ["accounting.contacts"] }],
  ])("rejects a %s mismatch before retrieving or updating the invoice", async (_label, connection) => {
    mocks.createAdminSupabaseClient.mockResolvedValue(createAdmin(documentRow()).client);
    mocks.getFreshXeroAccessToken.mockResolvedValue({ connection, tokenSet: { access_token: "access-token" } });
    await expect(updateExistingXeroSalesInvoice({
      organizationId: "org-1", accountingDocumentId: "document-1", queuedHash: "hash-current", workerJobId: "job-1",
    })).rejects.toMatchObject({ code: "connection_mismatch" });
    expect(mocks.getXeroInvoice).not.toHaveBeenCalled();
    expect(mocks.updateXeroSalesInvoice).not.toHaveBeenCalled();
  });

  it.each([
    ["wrong InvoiceID", { InvoiceID: "other" }, "invoice_identity_mismatch"],
    ["wrong InvoiceNumber", { InvoiceNumber: "PC-OTHER" }, "invoice_identity_mismatch"],
    ["wrong Type", { Type: "ACCPAY" }, "invoice_identity_mismatch"],
    ["partially paid", { Status: "AUTHORISED", AmountPaid: 1 }, "invoice_partially_paid"],
    ["fully paid", { Status: "PAID", AmountPaid: 1035 }, "invoice_fully_paid"],
    ["voided", { Status: "VOIDED" }, "invoice_voided_or_deleted"],
    ["deleted", { Status: "DELETED" }, "invoice_voided_or_deleted"],
  ])("stops before update for a %s provider invoice", async (_label, overrides, code) => {
    const document = documentRow();
    const admin = createAdmin(document);
    mocks.createAdminSupabaseClient.mockResolvedValue(admin.client);
    mocks.getXeroInvoice.mockResolvedValueOnce([xeroInvoice(overrides)]);
    await expect(updateExistingXeroSalesInvoice({
      organizationId: "org-1", accountingDocumentId: "document-1", queuedHash: "hash-current", workerJobId: "job-1",
    })).rejects.toMatchObject({ code });
    expect(mocks.updateXeroSalesInvoice).not.toHaveBeenCalled();
    expect(document).toMatchObject({
      external_document_id: "invoice-1",
      last_synced_hash: "old-hash",
      export_status: "attention_required",
      last_error_code: code,
    });
  });

  it("stores attention when the stored InvoiceID is missing in Xero and never recreates", async () => {
    const document = documentRow();
    const admin = createAdmin(document);
    mocks.createAdminSupabaseClient.mockResolvedValue(admin.client);
    mocks.getXeroInvoice.mockResolvedValue([]);
    await expect(updateExistingXeroSalesInvoice({
      organizationId: "org-1", accountingDocumentId: "document-1", queuedHash: "hash-current", workerJobId: "job-1",
    })).rejects.toMatchObject({ code: "invoice_missing_in_xero" });
    expect(mocks.updateXeroSalesInvoice).not.toHaveBeenCalled();
    expect(document.external_document_id).toBe("invoice-1");
    expect(document.last_synced_hash).toBe("old-hash");
  });

  it("normalizes a Xero 404 for the stored InvoiceID to the same no-recreate failure", async () => {
    const document = documentRow();
    const admin = createAdmin(document);
    mocks.createAdminSupabaseClient.mockResolvedValue(admin.client);
    mocks.getXeroInvoice.mockRejectedValue(new XeroRequestError("Not found", { status: 404 }));
    await expect(updateExistingXeroSalesInvoice({
      organizationId: "org-1", accountingDocumentId: "document-1", queuedHash: "hash-current", workerJobId: "job-1",
    })).rejects.toMatchObject({ code: "invoice_missing_in_xero", isRetryable: false });
    expect(mocks.updateXeroSalesInvoice).not.toHaveBeenCalled();
    expect(document).toMatchObject({ external_document_id: "invoice-1", last_synced_hash: "old-hash" });
  });

  it("overwrites manual line divergence when Xero still allows financial edits", async () => {
    mocks.getXeroInvoice.mockResolvedValueOnce([xeroInvoice({
      Total: 999, TotalTax: 99, LineItems: [{ Description: "manual edit", UnitAmount: 777 }],
    })]);
    await run();
    expect(mocks.updateXeroSalesInvoice).toHaveBeenCalledWith(expect.objectContaining({ invoice: payload }));
  });

  it("stores a locked-period provider rejection without advancing the hash", async () => {
    const document = documentRow();
    const admin = createAdmin(document);
    mocks.createAdminSupabaseClient.mockResolvedValue(admin.client);
    mocks.updateXeroSalesInvoice.mockRejectedValue(new Error("Invoice falls within a locked period"));
    await expect(updateExistingXeroSalesInvoice({
      organizationId: "org-1", accountingDocumentId: "document-1", queuedHash: "hash-current", workerJobId: "job-1",
    })).rejects.toMatchObject({ code: "invoice_locked" });
    expect(document).toMatchObject({ last_synced_hash: "old-hash", last_error_code: "invoice_locked" });
    expect(mocks.getXeroInvoice).toHaveBeenCalledTimes(1);
  });

  it("stores a generic provider rejection safely and preserves the existing link and hash", async () => {
    const document = documentRow();
    const admin = createAdmin(document);
    mocks.createAdminSupabaseClient.mockResolvedValue(admin.client);
    mocks.updateXeroSalesInvoice.mockRejectedValue(new Error("provider validation detail"));
    await expect(updateExistingXeroSalesInvoice({
      organizationId: "org-1", accountingDocumentId: "document-1", queuedHash: "hash-current", workerJobId: "job-1",
    })).rejects.toMatchObject({ code: "xero_update_rejected" });
    expect(document).toMatchObject({
      external_document_id: "invoice-1",
      last_synced_hash: "old-hash",
      last_error_code: "xero_update_rejected",
      last_error_message: "Xero rejected the linked Sales Invoice update.",
    });
  });

  it("rejects update-response and refreshed identity mismatches and preserves the old hash", async () => {
    const document = documentRow();
    const admin = createAdmin(document);
    mocks.createAdminSupabaseClient.mockResolvedValue(admin.client);
    mocks.updateXeroSalesInvoice.mockResolvedValue([xeroInvoice({ InvoiceID: "wrong" })]);
    await expect(updateExistingXeroSalesInvoice({
      organizationId: "org-1", accountingDocumentId: "document-1", queuedHash: "hash-current", workerJobId: "job-1",
    })).rejects.toMatchObject({ code: "invoice_identity_mismatch" });
    expect(mocks.getXeroInvoice).toHaveBeenCalledTimes(1);
    expect(document.last_synced_hash).toBe("old-hash");
  });

  it.each([
    ["total", { Total: 999 }],
    ["tax", { TotalTax: 99 }],
    ["status", { Status: "DRAFT" }],
    ["Contact", { Contact: { ContactID: "wrong" } }],
  ])("rejects a post-update %s mismatch before success persistence", async (_label, refreshedOverrides) => {
    const document = documentRow();
    const admin = createAdmin(document);
    mocks.createAdminSupabaseClient.mockResolvedValue(admin.client);
    mocks.getXeroInvoice
      .mockResolvedValueOnce([xeroInvoice()])
      .mockResolvedValueOnce([xeroInvoice(refreshedOverrides)]);
    await expect(updateExistingXeroSalesInvoice({
      organizationId: "org-1", accountingDocumentId: "document-1", queuedHash: "hash-current", workerJobId: "job-1",
    })).rejects.toMatchObject({ code: "invalid_xero_invoice" });
    expect(document.last_synced_hash).toBe("old-hash");
    expect(document.last_error_code).toBe("invalid_xero_invoice");
  });

  it("uses a stable update key scoped to InvoiceID, current hash, and update intent", () => {
    const first = buildExistingXeroSalesInvoiceUpdateIdempotencyKey({ invoiceId: "invoice-1", currentHash: "hash-1" });
    expect(first).toBe(buildExistingXeroSalesInvoiceUpdateIdempotencyKey({ invoiceId: "invoice-1", currentHash: "hash-1" }));
    expect(first).not.toBe(buildExistingXeroSalesInvoiceUpdateIdempotencyKey({ invoiceId: "invoice-2", currentHash: "hash-1" }));
    expect(first).not.toBe(buildExistingXeroSalesInvoiceUpdateIdempotencyKey({ invoiceId: "invoice-1", currentHash: "hash-2" }));
  });
});
