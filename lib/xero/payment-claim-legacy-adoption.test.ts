import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  createAdminSupabaseClient: vi.fn(),
  resolvePaymentClaimXeroReadinessContext: vi.fn(),
  evaluatePaymentClaimXeroReadinessSnapshot: vi.fn(),
  buildPaymentClaimXeroPayloadFromResolvedSnapshot: vi.fn(),
  buildPaymentClaimXeroCurrentStateHashFromPayload: vi.fn(),
  getFreshXeroAccessToken: vi.fn(),
  getXeroInvoice: vi.fn(),
  findXeroInvoicesByNumber: vi.fn(),
  rpc: vi.fn(),
  insertFailure: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: mocks.createAdminSupabaseClient,
}));
vi.mock("@/lib/xero/payment-claim-readiness", () => ({
  resolvePaymentClaimXeroReadinessContext: mocks.resolvePaymentClaimXeroReadinessContext,
  evaluatePaymentClaimXeroReadinessSnapshot: mocks.evaluatePaymentClaimXeroReadinessSnapshot,
}));
vi.mock("@/lib/xero/payment-claim-sales-invoice-payload", () => ({
  buildPaymentClaimXeroPayloadFromResolvedSnapshot:
    mocks.buildPaymentClaimXeroPayloadFromResolvedSnapshot,
}));
vi.mock("@/lib/xero/payment-claim-sales-invoice-hash", () => ({
  buildPaymentClaimXeroCurrentStateHashFromPayload:
    mocks.buildPaymentClaimXeroCurrentStateHashFromPayload,
}));
vi.mock("@/lib/xero/service", () => ({
  getFreshXeroAccessToken: mocks.getFreshXeroAccessToken,
}));
vi.mock("@/lib/xero/client", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/xero/client")>();
  return {
    ...original,
    getXeroInvoice: mocks.getXeroInvoice,
    findXeroInvoicesByNumber: mocks.findXeroInvoicesByNumber,
  };
});

import { adoptLegacyVoidedPaymentClaimIfNeeded } from "./payment-claim-legacy-adoption";

type Row = Record<string, unknown>;

const document: Row = {
  id: "document-1",
  integration_contract: null,
  accounting_connection_id: "connection-1",
  tenant_id: "tenant-1",
  external_document_id: "invoice-legacy",
  external_document_number: "26028-CL-01",
  normalized_external_status: "voided",
};

function snapshot(accountingDocuments: Row[] = [document]) {
  return {
    organization: { id: "org-1" },
    project: { id: "project-1", name: "Test Project Alpha" },
    claim: {
      id: "claim-1",
      claim_number: "26028-CL-01",
      total_payable: 115,
      updated_at: "2026-07-25T00:00:00Z",
    },
    accountingDocuments,
  };
}

function invoice(overrides: Record<string, unknown> = {}) {
  return {
    Type: "ACCREC",
    Status: "VOIDED",
    InvoiceID: "invoice-legacy",
    InvoiceNumber: "26028-CL-01",
    Reference: "Test Project Alpha | Claim 26028-CL-01",
    Contact: { ContactID: "contact-1", Name: "Example Construction Ltd" },
    CurrencyCode: "NZD",
    Date: "2026-07-14",
    DueDate: "2026-07-21",
    UpdatedDateUTC: "2026-07-25T06:36:02Z",
    LineAmountTypes: "Exclusive",
    LineItems: [{
      Description: "Payment Claim 26028-CL-01",
      Quantity: 1,
      UnitAmount: 100,
      LineAmount: 100,
      TaxAmount: 15,
      AccountCode: "200",
      AccountID: "account-1",
      TaxType: "OUTPUT2",
      Tracking: [],
    }],
    SubTotal: 100,
    TotalTax: 15,
    Total: 115,
    AmountDue: 115,
    AmountPaid: 0,
    AmountCredited: 0,
    Payments: [],
    CreditNotes: [],
    ...overrides,
  };
}

describe("legacy VOIDED Payment Claim adoption", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolvePaymentClaimXeroReadinessContext.mockResolvedValue({
      snapshot: snapshot(),
    });
    mocks.evaluatePaymentClaimXeroReadinessSnapshot.mockReturnValue({
      ready: true,
      blockers: [],
    });
    mocks.buildPaymentClaimXeroPayloadFromResolvedSnapshot.mockReturnValue({
      payload: {},
      reconciliation: {},
    });
    mocks.buildPaymentClaimXeroCurrentStateHashFromPayload.mockReturnValue({
      hash: "current-state-hash",
    });
    mocks.getFreshXeroAccessToken.mockResolvedValue({
      connection: {
        id: "connection-1",
        tenant_id: "tenant-1",
      },
      tokenSet: { access_token: "access-token" },
    });
    mocks.getXeroInvoice.mockResolvedValue([invoice()]);
    mocks.findXeroInvoicesByNumber.mockResolvedValue([invoice()]);
    mocks.rpc.mockResolvedValue({
      data: {
        accountingDocumentId: "document-1",
        accountingRevisionId: "revision-legacy",
        adopted: true,
      },
      error: null,
    });
    mocks.insertFailure.mockResolvedValue({ error: null });
    mocks.createAdminSupabaseClient.mockReturnValue({
      rpc: mocks.rpc,
      from: vi.fn(() => ({ insert: mocks.insertFailure })),
    });
  });

  it("retrieves and exact-searches the predecessor before one service-only adoption RPC", async () => {
    const result = await adoptLegacyVoidedPaymentClaimIfNeeded({
      organizationId: "org-1",
      claimId: "claim-1",
      actorUserId: "user-1",
    });
    expect(result).toMatchObject({
      applicable: true,
      adopted: true,
      accountingRevisionId: "revision-legacy",
    });
    expect(mocks.getXeroInvoice).toHaveBeenCalledWith(
      "access-token",
      "tenant-1",
      "invoice-legacy",
    );
    expect(mocks.findXeroInvoicesByNumber).toHaveBeenCalledWith({
      accessToken: "access-token",
      tenantId: "tenant-1",
      invoiceNumber: "26028-CL-01",
      type: "ACCREC",
    });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc.mock.calls[0][0]).toBe(
      "adopt_legacy_voided_payment_claim_phase2c",
    );
    expect(mocks.rpc.mock.calls[0][1].p_input).toMatchObject({
      externalDocumentId: "invoice-legacy",
      externalDocumentNumber: "26028-CL-01",
      evidenceQuality: "reconstructed_from_current_xero_and_tradesstack",
    });
  });

  it.each([
    ["not voided", { Status: "AUTHORISED" }, "predecessor_not_voided"],
    ["paid", { AmountPaid: 10, Payments: [{ Amount: 10 }] }, "payments_exist"],
    ["credited", { AmountCredited: 10, CreditNotes: [{ Amount: 10 }] }, "credits_exist"],
  ])("blocks a %s predecessor before adoption", async (_label, overrides, code) => {
    mocks.getXeroInvoice.mockResolvedValue([invoice(overrides)]);
    await expect(adoptLegacyVoidedPaymentClaimIfNeeded({
      organizationId: "org-1",
      claimId: "claim-1",
      actorUserId: "user-1",
    })).rejects.toMatchObject({ code });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["lower-case status", { Status: "voided" }, "predecessor_not_voided"],
    ["wrong tenant identity", { InvoiceID: "other-invoice" }, "remote_identity_mismatch"],
    ["non-zero credited without credits array", { AmountCredited: 1 }, "credits_exist"],
    ["empty payments with non-zero paid", { Payments: [], AmountPaid: 1 }, "payments_exist"],
  ])("rejects %s before the adoption RPC", async (_label, overrides, code) => {
    mocks.getXeroInvoice.mockResolvedValue([invoice(overrides)]);
    await expect(adoptLegacyVoidedPaymentClaimIfNeeded({
      organizationId: "org-1",
      claimId: "claim-1",
      actorUserId: "user-1",
    })).rejects.toMatchObject({ code });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("accepts explicit empty payment and credit arrays", async () => {
    mocks.getXeroInvoice.mockResolvedValue([invoice({
      Payments: [],
      CreditNotes: [],
    })]);
    await expect(adoptLegacyVoidedPaymentClaimIfNeeded({
      organizationId: "org-1",
      claimId: "claim-1",
      actorUserId: "user-1",
    })).resolves.toMatchObject({ adopted: true });
  });

  it("accepts absent payment and credit arrays as explicit no-record evidence", async () => {
    const value: Record<string, unknown> = invoice();
    delete value.Payments;
    delete value.CreditNotes;
    mocks.getXeroInvoice.mockResolvedValue([value]);
    mocks.findXeroInvoicesByNumber.mockResolvedValue([value]);
    await expect(adoptLegacyVoidedPaymentClaimIfNeeded({
      organizationId: "org-1",
      claimId: "claim-1",
      actorUserId: "user-1",
    })).resolves.toMatchObject({ adopted: true });
  });

  it("returns a structured safe error and persists the internal RPC cause", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: {
        code: "23514",
        message: 'new row violates check constraint "accounting_revision_amounts_check"',
        details: "Failing row contains internal accounting evidence.",
        hint: null,
      },
    });
    const caught = await adoptLegacyVoidedPaymentClaimIfNeeded({
      organizationId: "org-1",
      claimId: "claim-1",
      actorUserId: "user-1",
    }).catch((error) => error);
    expect(caught).toMatchObject({
      code: "LEGACY_ADOPTION_CONSTRAINT_FAILED",
      message: "The historical invoice could not satisfy the immutable accounting constraints.",
    });
    expect(caught.supportReference).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(mocks.insertFailure).toHaveBeenCalledWith(expect.objectContaining({
      support_reference: caught.supportReference,
      internal_sqlstate: "23514",
      failed_constraint: "accounting_revision_amounts_check",
      safe_code: "LEGACY_ADOPTION_CONSTRAINT_FAILED",
    }));
  });

  it("does nothing for an already revision-backed claim", async () => {
    mocks.resolvePaymentClaimXeroReadinessContext.mockResolvedValue({
      snapshot: snapshot([{ ...document, integration_contract: "payment_claim_revision_v1" }]),
    });
    await expect(adoptLegacyVoidedPaymentClaimIfNeeded({
      organizationId: "org-1",
      claimId: "claim-1",
      actorUserId: "user-1",
    })).resolves.toEqual({ adopted: false, applicable: false });
    expect(mocks.getXeroInvoice).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
