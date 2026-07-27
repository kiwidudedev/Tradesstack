import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  getXeroInvoice: vi.fn(),
  updateXeroSalesInvoice: vi.fn(),
  getFreshXeroAccessToken: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({ rpc: mocks.rpc }),
}));
vi.mock("@/lib/xero/client", async (importOriginal) => {
  const original = await importOriginal<typeof import("./client")>();
  return {
    ...original,
    getXeroInvoice: mocks.getXeroInvoice,
    updateXeroSalesInvoice: mocks.updateXeroSalesInvoice,
  };
});
vi.mock("@/lib/xero/service", () => ({
  getFreshXeroAccessToken: mocks.getFreshXeroAccessToken,
}));

import { XeroRequestError } from "./client";
import {
  executePaymentClaimAccountingUpdate,
} from "./payment-claim-accounting-update-worker";

const previousPayload = {
  Type: "ACCREC" as const,
  Status: "AUTHORISED" as const,
  Contact: { ContactID: "contact-1" },
  InvoiceNumber: "26028-PC-03",
  Reference: "Test Project Alpha | Payment Claim 26028-PC-03",
  Date: "2026-07-26",
  DueDate: "2026-08-20",
  CurrencyCode: "NZD" as const,
  LineAmountTypes: "Exclusive" as const,
  LineItems: [{
    Description: "Payment Claim 26028-PC-03",
    Quantity: 1,
    UnitAmount: 400,
    AccountCode: "600",
    TaxType: "OUTPUT2",
  }],
};
const proposedPayload = {
  ...previousPayload,
  LineItems: [{
    ...previousPayload.LineItems[0],
    UnitAmount: 700,
  }],
};

function invoice(payload: typeof previousPayload) {
  const subtotal = payload.LineItems.reduce(
    (sum, line) => sum + line.UnitAmount,
    0,
  );
  const tax = Math.round(subtotal * 0.15 * 100) / 100;
  return {
    InvoiceID: "65d684a3-26ee-4aaa-8a80-447c7ad9fac8",
    InvoiceNumber: payload.InvoiceNumber,
    Type: payload.Type,
    Status: payload.Status,
    Contact: payload.Contact,
    Reference: payload.Reference,
    Date: `${payload.Date}T00:00:00`,
    DueDate: `${payload.DueDate}T00:00:00`,
    CurrencyCode: payload.CurrencyCode,
    LineAmountTypes: payload.LineAmountTypes,
    LineItems: payload.LineItems.map((line) => ({
      ...line,
      LineAmount: line.UnitAmount,
    })),
    SubTotal: subtotal,
    TotalTax: tax,
    Total: subtotal + tax,
    AmountPaid: 0,
    AmountCredited: 0,
    AmountDue: subtotal + tax,
    Payments: [],
    CreditNotes: [],
    UpdatedDateUTC: "2026-07-26T02:00:00.000Z",
  };
}

function execution() {
  return {
    document: {
      id: "document-1",
      integration_contract: "payment_claim_revision_v1",
      active_accounting_revision_id: "revision-1",
      external_document_id: "65d684a3-26ee-4aaa-8a80-447c7ad9fac8",
      external_document_number: "26028-PC-03",
    },
    previousRevision: {
      id: "revision-1",
      external_document_id: "65d684a3-26ee-4aaa-8a80-447c7ad9fac8",
      external_document_number: "26028-PC-03",
      payload_snapshot: previousPayload,
      subtotal_minor: 40_000,
      tax_minor: 6_000,
      total_minor: 46_000,
    },
    revision: {
      id: "revision-2",
      organization_id: "organization-1",
      connection_id: "connection-1",
      tenant_id: "tenant-1",
      revision_intent: "direct_update",
      resolution_strategy: "update_existing",
      lifecycle_state: "queued",
      provider_document_type: "ACCREC",
      requested_provider_status: "AUTHORISED",
      external_document_number: "26028-PC-03",
      payload_snapshot: proposedPayload,
      subtotal_minor: 70_000,
      tax_minor: 10_500,
      total_minor: 80_500,
    },
    lines: [{ id: "line-1" }],
    attempt: {
      id: "attempt-1",
      attempt_intent: "update",
      idempotency_key: "idem-1",
    },
  };
}

describe("immutable Payment Claim same-invoice update worker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getFreshXeroAccessToken.mockResolvedValue({
      connection: {
        id: "connection-1",
        tenant_id: "tenant-1",
        scope: ["accounting.invoices"],
      },
      tokenSet: { access_token: "access-token" },
    });
    mocks.rpc.mockImplementation((name: string) => {
      if (name === "claim_accounting_revision_attempt_phase2b") {
        return Promise.resolve({
          data: { id: "attempt-1", lease_token: "lease-1" },
          error: null,
        });
      }
      if (name === "get_payment_claim_accounting_update_execution") {
        return Promise.resolve({ data: execution(), error: null });
      }
      return Promise.resolve({ data: true, error: null });
    });
  });

  it("updates only the exact existing InvoiceID and completes the successor", async () => {
    mocks.getXeroInvoice
      .mockResolvedValueOnce([invoice(previousPayload)])
      .mockResolvedValueOnce([invoice(proposedPayload)]);
    mocks.updateXeroSalesInvoice.mockResolvedValue([invoice(proposedPayload)]);

    const result = await executePaymentClaimAccountingUpdate({
      accountingRevisionId: "revision-2",
      attemptId: "attempt-1",
      workerId: "worker-1",
      jobId: "job-1",
    });

    expect(mocks.updateXeroSalesInvoice).toHaveBeenCalledTimes(1);
    expect(mocks.updateXeroSalesInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        invoiceId: "65d684a3-26ee-4aaa-8a80-447c7ad9fac8",
        invoice: proposedPayload,
        idempotencyKey: "idem-1",
      }),
    );
    expect(mocks.rpc).toHaveBeenCalledWith(
      "complete_payment_claim_accounting_update",
      expect.objectContaining({
        p_result: expect.objectContaining({
          jobId: "job-1",
          externalDocumentId: "65d684a3-26ee-4aaa-8a80-447c7ad9fac8",
          externalDocumentNumber: "26028-PC-03",
        }),
      }),
    );
    expect(result.exact).toBe(true);
  });

  it("recovers an already-updated exact InvoiceID without another write", async () => {
    mocks.getXeroInvoice
      .mockResolvedValueOnce([invoice(proposedPayload)])
      .mockResolvedValueOnce([invoice(proposedPayload)]);

    const result = await executePaymentClaimAccountingUpdate({
      accountingRevisionId: "revision-2",
      attemptId: "attempt-1",
      workerId: "worker-1",
      jobId: "job-1",
    });

    expect(mocks.updateXeroSalesInvoice).not.toHaveBeenCalled();
    expect(result.recovered).toBe(true);
  });

  it("recovers a timed-out PUT by retrieving the same InvoiceID", async () => {
    mocks.getXeroInvoice
      .mockResolvedValueOnce([invoice(previousPayload)])
      .mockResolvedValueOnce([invoice(proposedPayload)])
      .mockResolvedValueOnce([invoice(proposedPayload)]);
    mocks.updateXeroSalesInvoice.mockRejectedValue(
      new XeroRequestError("Timed out after sending.", {
        status: 408,
        isRetryable: true,
      }),
    );

    const result = await executePaymentClaimAccountingUpdate({
      accountingRevisionId: "revision-2",
      attemptId: "attempt-1",
      workerId: "worker-1",
      jobId: "job-1",
    });

    expect(mocks.updateXeroSalesInvoice).toHaveBeenCalledTimes(1);
    expect(mocks.getXeroInvoice).toHaveBeenCalledTimes(3);
    expect(result.recovered).toBe(true);
  });

  it("retries the same idempotent PUT when timeout recovery still matches the predecessor", async () => {
    mocks.getXeroInvoice
      .mockResolvedValueOnce([invoice(previousPayload)])
      .mockResolvedValueOnce([invoice(previousPayload)])
      .mockResolvedValueOnce([invoice(proposedPayload)]);
    mocks.updateXeroSalesInvoice
      .mockRejectedValueOnce(new XeroRequestError("Timed out after sending.", {
        status: 408,
        isRetryable: true,
      }))
      .mockResolvedValueOnce([invoice(proposedPayload)]);

    const result = await executePaymentClaimAccountingUpdate({
      accountingRevisionId: "revision-2",
      attemptId: "attempt-1",
      workerId: "worker-1",
      jobId: "job-1",
    });

    expect(mocks.updateXeroSalesInvoice).toHaveBeenCalledTimes(2);
    expect(mocks.updateXeroSalesInvoice.mock.calls[0]?.[0].idempotencyKey)
      .toBe(mocks.updateXeroSalesInvoice.mock.calls[1]?.[0].idempotencyKey);
    expect(result.exact).toBe(true);
  });

  it.each([
    ["diverged", { Reference: "Changed directly in Xero" }],
    ["paid", { AmountPaid: 10, Payments: [{ PaymentID: "payment-1" }] }],
    ["credited", {
      AmountCredited: 10,
      CreditNotes: [{ CreditNoteID: "credit-1" }],
    }],
  ])("blocks a remotely %s predecessor without writing", async (
    _label,
    changes,
  ) => {
    mocks.getXeroInvoice.mockResolvedValueOnce([
      { ...invoice(previousPayload), ...changes },
    ]);

    await expect(executePaymentClaimAccountingUpdate({
      accountingRevisionId: "revision-2",
      attemptId: "attempt-1",
      workerId: "worker-1",
      jobId: "job-1",
    })).rejects.toMatchObject({
      uncertain: true,
    });
    expect(mocks.updateXeroSalesInvoice).not.toHaveBeenCalled();
  });
});
