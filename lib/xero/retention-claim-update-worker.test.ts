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

import { executeRetentionClaimUpdate } from "./retention-claim-update-worker";
import { XeroRequestError } from "./client";

const previousPayload = {
  Type: "ACCREC" as const,
  Status: "AUTHORISED" as const,
  Contact: { ContactID: "contact-1" },
  InvoiceNumber: "26028-RC-01-R2",
  Reference: "Retention Claim 26028-RC-01",
  Date: "2026-07-26",
  DueDate: "2026-08-20",
  CurrencyCode: "NZD" as const,
  LineAmountTypes: "Exclusive" as const,
  LineItems: [{
    Description: "Retention from 26028-CL-01",
    Quantity: 1,
    UnitAmount: 1529.19,
    AccountCode: "700",
    TaxType: "OUTPUT2",
  }],
};
const proposedPayload = {
  ...previousPayload,
  LineItems: [
    ...previousPayload.LineItems,
    {
      Description: "Retention from 26028-CL-03",
      Quantity: 1,
      UnitAmount: 24.75,
      AccountCode: "700",
      TaxType: "OUTPUT2",
    },
  ],
};

function invoice(payload: typeof previousPayload | typeof proposedPayload) {
  const subtotal = payload.LineItems.reduce(
    (sum, line) => sum + line.UnitAmount,
    0,
  );
  const tax = Math.round(subtotal * 0.15 * 100) / 100;
  return {
    InvoiceID: "79eea4de-c16f-4e26-833d-e1faf6f91486",
    InvoiceNumber: "26028-RC-01-R2",
    Type: "ACCREC",
    Status: "AUTHORISED",
    Contact: { ContactID: "contact-1" },
    Reference: payload.Reference,
    Date: `${payload.Date}T00:00:00`,
    DueDate: `${payload.DueDate}T00:00:00`,
    CurrencyCode: "NZD",
    LineAmountTypes: "Exclusive",
    LineItems: payload.LineItems.map((line) => ({
      ...line,
      LineAmount: line.UnitAmount,
      TaxAmount: Math.round(line.UnitAmount * 0.15 * 100) / 100,
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
      integration_contract: "retention_claim_revision_v1",
      active_accounting_revision_id: "revision-1",
      external_document_id: "79eea4de-c16f-4e26-833d-e1faf6f91486",
      external_document_number: "26028-RC-01-R2",
    },
    previousRevision: {
      id: "revision-1",
      external_document_id: "79eea4de-c16f-4e26-833d-e1faf6f91486",
      external_document_number: "26028-RC-01-R2",
      payload_snapshot: previousPayload,
      subtotal_minor: 152_919,
      tax_minor: 22_938,
      total_minor: 175_857,
    },
    revision: {
      id: "revision-2",
      organization_id: "organization-1",
      connection_id: "connection-1",
      tenant_id: "tenant-1",
      revision_intent: "direct_update",
      lifecycle_state: "queued",
      provider_document_type: "ACCREC",
      requested_provider_status: "AUTHORISED",
      external_document_number: "26028-RC-01-R2",
      payload_snapshot: proposedPayload,
      subtotal_minor: 155_394,
      tax_minor: 23_309,
      total_minor: 178_703,
    },
    lines: [{ id: "line-1" }, { id: "line-2" }],
    attempt: {
      id: "attempt-1",
      attempt_intent: "update",
      idempotency_key: "idem-1",
    },
  };
}

describe("cumulative Retention same-invoice update worker", () => {
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
      if (name === "get_master_retention_claim_execution") {
        return Promise.resolve({ data: execution(), error: null });
      }
      return Promise.resolve({ data: true, error: null });
    });
  });

  it("updates the exact existing InvoiceID and verifies the cumulative result", async () => {
    mocks.getXeroInvoice
      .mockResolvedValueOnce([invoice(previousPayload)])
      .mockResolvedValueOnce([invoice(proposedPayload)]);
    mocks.updateXeroSalesInvoice.mockResolvedValue([
      invoice(proposedPayload),
    ]);

    const result = await executeRetentionClaimUpdate({
      accountingRevisionId: "revision-2",
      attemptId: "attempt-1",
      workerId: "worker-1",
    });

    expect(mocks.updateXeroSalesInvoice).toHaveBeenCalledTimes(1);
    expect(mocks.updateXeroSalesInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        invoiceId: "79eea4de-c16f-4e26-833d-e1faf6f91486",
        invoice: proposedPayload,
        idempotencyKey: "idem-1",
      }),
    );
    expect(result).toMatchObject({
      invoiceId: "79eea4de-c16f-4e26-833d-e1faf6f91486",
      invoiceNumber: "26028-RC-01-R2",
      exact: true,
    });
    expect(mocks.rpc).toHaveBeenCalledWith(
      "complete_master_retention_claim_push",
      expect.objectContaining({
        p_result: expect.objectContaining({
          externalDocumentId:
            "79eea4de-c16f-4e26-833d-e1faf6f91486",
          externalDocumentNumber: "26028-RC-01-R2",
        }),
      }),
    );
  });

  it("recovers an already-updated same InvoiceID without another update", async () => {
    mocks.getXeroInvoice
      .mockResolvedValueOnce([invoice(proposedPayload)])
      .mockResolvedValueOnce([invoice(proposedPayload)]);

    const result = await executeRetentionClaimUpdate({
      accountingRevisionId: "revision-2",
      attemptId: "attempt-1",
      workerId: "worker-1",
    });

    expect(mocks.updateXeroSalesInvoice).not.toHaveBeenCalled();
    expect(result.recovered).toBe(true);
  });

  it("recovers a timed-out update by reading the same InvoiceID", async () => {
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

    const result = await executeRetentionClaimUpdate({
      accountingRevisionId: "revision-2",
      attemptId: "attempt-1",
      workerId: "worker-1",
    });

    expect(mocks.updateXeroSalesInvoice).toHaveBeenCalledTimes(1);
    expect(mocks.getXeroInvoice).toHaveBeenCalledTimes(3);
    expect(mocks.getXeroInvoice).toHaveBeenNthCalledWith(
      2,
      "access-token",
      "tenant-1",
      "79eea4de-c16f-4e26-833d-e1faf6f91486",
    );
    expect(result.recovered).toBe(true);
  });

  it("refuses a remote invoice that matches neither immutable revision", async () => {
    const changed = invoice(previousPayload);
    changed.Reference = "Changed directly in Xero";
    mocks.getXeroInvoice.mockResolvedValueOnce([changed]);

    await expect(executeRetentionClaimUpdate({
      accountingRevisionId: "revision-2",
      attemptId: "attempt-1",
      workerId: "worker-1",
    })).rejects.toMatchObject({
      code: "RETENTION_UPDATE_UNCERTAIN",
      uncertain: true,
    });
    expect(mocks.updateXeroSalesInvoice).not.toHaveBeenCalled();
  });

  it.each([
    ["paid", { AmountPaid: 100, AmountDue: 1491.07, Payments: [{ PaymentID: "payment-1" }] }],
    ["credited", { AmountCredited: 100, CreditNotes: [{ CreditNoteID: "credit-1" }] }],
  ])("blocks a remotely %s active invoice before update", async (_label, settlement) => {
    mocks.getXeroInvoice.mockResolvedValueOnce([
      { ...invoice(previousPayload), ...settlement },
    ]);

    await expect(executeRetentionClaimUpdate({
      accountingRevisionId: "revision-2",
      attemptId: "attempt-1",
      workerId: "worker-1",
    })).rejects.toMatchObject({
      code: "RETENTION_UPDATE_UNCERTAIN",
      uncertain: true,
    });
    expect(mocks.updateXeroSalesInvoice).not.toHaveBeenCalled();
  });
});
