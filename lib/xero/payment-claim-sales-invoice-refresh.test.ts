import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  createAdminSupabaseClient: vi.fn(),
  getFreshXeroAccessToken: vi.fn(),
  getOrganizationXeroConnection: vi.fn(),
  getXeroInvoice: vi.fn(),
  getCurrentOrganizationMember: vi.fn(),
  hasOrganizationPermission: vi.fn(),
  getOrganizationPermissionsBatch: vi.fn(),
  isPaymentClaimInitialPushEnabled: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabaseClient: mocks.createAdminSupabaseClient }));
vi.mock("@/lib/xero/service", () => ({
  getFreshXeroAccessToken: mocks.getFreshXeroAccessToken,
  getOrganizationXeroConnection: mocks.getOrganizationXeroConnection,
}));
vi.mock("@/lib/xero/client", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/xero/client")>();
  return { ...original, getXeroInvoice: mocks.getXeroInvoice };
});
vi.mock("@/lib/projects-server", () => ({ getCurrentOrganizationMember: mocks.getCurrentOrganizationMember }));
vi.mock("@/lib/permissions-server", () => ({
  hasOrganizationPermission: mocks.hasOrganizationPermission,
  getOrganizationPermissionsBatch: mocks.getOrganizationPermissionsBatch,
}));
vi.mock("@/lib/xero/payment-claim-initial-push-proposal", () => ({
  isPaymentClaimInitialPushEnabled: mocks.isPaymentClaimInitialPushEnabled,
}));

import {
  enqueuePaymentClaimXeroRefreshForCurrentUser,
  enqueueXeroSalesInvoiceRefresh,
  normalizeXeroSalesInvoicePaymentState,
  recordXeroSalesInvoiceRefreshError,
  refreshXeroSalesInvoiceStatus,
} from "./payment-claim-sales-invoice-refresh";
import type { XeroInvoice } from "./types";

type Row = Record<string, unknown>;

function accountingDocument(overrides: Row = {}): Row {
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
    external_document_number: "PC-0042",
    export_status: "exported",
    amount_exported: 115,
    amount_paid: 0,
    amount_due: 115,
    amount_credited: 0,
    last_status_sync_error: null,
    ...overrides,
  };
}

function xeroInvoice(overrides: Partial<XeroInvoice> = {}): XeroInvoice {
  return {
    InvoiceID: "invoice-1",
    InvoiceNumber: "PC-0042",
    Type: "ACCREC",
    Status: "AUTHORISED",
    Total: 115,
    AmountPaid: 0,
    AmountDue: 115,
    AmountCredited: 0,
    UpdatedDateUTC: "2026-07-22T01:00:00Z",
    ...overrides,
  };
}

function createRefreshAdmin(document: Row, claimOverrides: Row = {}) {
  const updates: Array<{ table: string; values: Row }> = [];
  const claim: Row = {
    id: "claim-1",
    organization_id: "org-1",
    project_id: "project-1",
    claim_number: "PC-0042",
    status: "Submitted",
    due_date: "2099-07-30",
    claim_amount: 100,
    total_payable: 115,
    paid_amount: 0,
    updated_at: "2026-07-22T00:00:00Z",
    ...claimOverrides,
  };
  return {
    updates,
    claim,
    client: {
      async rpc(functionName: string, args: Row) {
        if (functionName !== "apply_xero_sales_invoice_payment_to_claim") {
          return { data: null, error: { message: "Unexpected RPC" } };
        }
        const documentValues = {
          raw_external_status: args.p_raw_external_status,
          normalized_external_status: args.p_normalized_external_status,
          amount_paid: args.p_amount_paid,
          amount_due: args.p_amount_due,
          amount_credited: args.p_amount_credited,
          fully_paid_at: args.p_fully_paid_at,
          provider_updated_at: args.p_provider_updated_at,
          last_status_synced_at: args.p_status_synced_at,
          last_status_sync_error: args.p_attention_message,
        };
        updates.push({ table: "organization_accounting_documents", values: documentValues });
        Object.assign(document, documentValues);
        const eligible = ["Submitted", "Unpaid", "Paid", "Overdue"].includes(String(claim.status));
        const applies = eligible && !args.p_attention_message && Boolean(args.p_projected_claim_status);
        if (applies) {
          const claimValues = { status: args.p_projected_claim_status, paid_amount: args.p_projected_paid_amount };
          updates.push({ table: "project_claims", values: claimValues });
          Object.assign(claim, claimValues);
        }
        return {
          data: [{
            document_id: document.id,
            claim_id: claim.id,
            claim_status: claim.status,
            claim_paid_amount: claim.paid_amount,
            claim_projection_applied: applies,
          }],
          error: null,
        };
      },
      from(table: string) {
        const rows = table === "organization_accounting_documents"
          ? [document]
          : table === "project_claims"
            ? [claim]
            : [];
        const filters: Array<(row: Row) => boolean> = [];
        let updateValues: Row | null = null;
        const builder = {
          select() { return builder; },
          update(values: Row) { updateValues = values; return builder; },
          eq(field: string, value: unknown) { filters.push((row) => row[field] === value); return builder; },
          maybeSingle() {
            const row = rows.find((candidate) => filters.every((filter) => filter(candidate))) ?? null;
            if (row && updateValues) {
              updates.push({ table, values: updateValues });
              Object.assign(row, updateValues);
            }
            return Promise.resolve({ data: row, error: null });
          },
        };
        return builder;
      },
    },
  };
}

describe("ACCREC payment projection normalization", () => {
  it.each([
    [xeroInvoice(), "unpaid", "awaiting_payment"],
    [xeroInvoice({ AmountPaid: 40, AmountDue: 75 }), "partially_paid", "partially_paid"],
    [xeroInvoice({ Status: "PAID", AmountPaid: 115, AmountDue: 0 }), "paid", "paid"],
    [xeroInvoice({ AmountPaid: 100, AmountCredited: 15, AmountDue: 0, FullyPaidOnDate: "2026-07-22" }), "paid", "paid"],
    [xeroInvoice({ Status: "VOIDED", AmountDue: 0 }), "attention_required", "voided"],
    [xeroInvoice({ Status: "DELETED", AmountDue: 0 }), "attention_required", "deleted"],
  ])("normalizes %# to %s", (invoice, projection, normalizedStatus) => {
    expect(normalizeXeroSalesInvoicePaymentState(invoice as XeroInvoice)).toMatchObject({
      paymentProjection: projection,
      normalizedStatus,
    });
  });

  it("uses invoice aggregates for multiple payments without storing Payment details", () => {
    const result = normalizeXeroSalesInvoicePaymentState(xeroInvoice({
      AmountPaid: 70,
      AmountDue: 45,
      Payments: [{ Amount: 30 }, { Amount: 40 }],
    }));
    expect(result).toMatchObject({ paymentProjection: "partially_paid", amountPaid: 70, amountDue: 45 });
  });

  it("requires valid paid evidence when total is positive and amount due is zero", () => {
    for (const Status of ["AUTHORISED", "PAID"]) {
      expect(normalizeXeroSalesInvoicePaymentState(xeroInvoice({
        Status, AmountPaid: 0, AmountCredited: 0, AmountDue: 0,
      })).paymentProjection).toBe("attention_required");
    }
  });
});

describe("ACCREC status refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getFreshXeroAccessToken.mockResolvedValue({
      connection: { id: "conn-1", tenant_id: "tenant-1" },
      tokenSet: { access_token: "access-token" },
    });
    mocks.getOrganizationXeroConnection.mockResolvedValue({
      id: "conn-1", tenant_id: "tenant-1", status: "connected",
    });
    mocks.getXeroInvoice.mockResolvedValue([xeroInvoice()]);
    mocks.getCurrentOrganizationMember.mockResolvedValue({ id: "member-1", organization_id: "org-1", user_id: "user-1" });
    mocks.hasOrganizationPermission.mockResolvedValue(true);
    mocks.getOrganizationPermissionsBatch.mockResolvedValue({
      "accounting.sales_invoices.view": true,
      "accounting.sales_invoices.manage": true,
      "accounting.sales_invoices.push": true,
    });
    mocks.isPaymentClaimInitialPushEnabled.mockResolvedValue(true);
  });

  it.each([
    ["unpaid", xeroInvoice(), 0, 115],
    ["partially_paid", xeroInvoice({ AmountPaid: 40, AmountDue: 75 }), 40, 75],
    ["paid", xeroInvoice({ Status: "PAID", AmountPaid: 115, AmountDue: 0, FullyPaidOnDate: "2026-07-22" }), 115, 0],
  ])("persists the %s projection atomically", async (projection, invoice, amountPaid, amountDue) => {
    const document = accountingDocument();
    const admin = createRefreshAdmin(document);
    mocks.createAdminSupabaseClient.mockResolvedValue(admin.client);
    mocks.getXeroInvoice.mockResolvedValue([invoice]);
    const result = await refreshXeroSalesInvoiceStatus({
      organizationId: "org-1", documentId: "document-1", workerJobId: "job-1",
    });
    expect(result.paymentProjection).toBe(projection);
    expect(mocks.getXeroInvoice).toHaveBeenCalledWith("access-token", "tenant-1", "invoice-1");
    expect(document).toMatchObject({
      amount_paid: amountPaid,
      amount_due: amountDue,
      amount_credited: Number(invoice.AmountCredited),
      last_status_sync_error: null,
    });
    expect(document.last_status_synced_at).toBeTruthy();
    if (projection === "paid") expect(document.fully_paid_at).toBe("2026-07-22T00:00:00.000Z");
    expect(admin.updates.filter((entry) => entry.table === "organization_accounting_documents")).toHaveLength(1);
  });

  it.each([
    ["Submitted becomes Unpaid", { status: "Submitted", due_date: "2099-07-30" }, xeroInvoice(), "Unpaid", 0],
    ["full payment becomes Paid", { status: "Unpaid", due_date: "2099-07-30" }, xeroInvoice({ Status: "PAID", AmountPaid: 115, AmountDue: 0 }), "Paid", 100],
    ["partial payment remains Unpaid", { status: "Paid", due_date: "2099-07-30" }, xeroInvoice({ AmountPaid: 40, AmountDue: 75 }), "Unpaid", 34.78],
    ["partial payment becomes Overdue", { status: "Paid", due_date: "2020-01-01" }, xeroInvoice({ AmountPaid: 40, AmountDue: 75 }), "Overdue", 34.78],
    ["payment reversal becomes Unpaid", { status: "Paid", due_date: "2099-07-30", paid_amount: 100 }, xeroInvoice(), "Unpaid", 0],
    ["overdue payment reversal becomes Overdue", { status: "Paid", due_date: "2020-01-01", paid_amount: 100 }, xeroInvoice(), "Overdue", 0],
  ] as const)("atomically projects claim state: %s", async (_label, claim, invoice, status, paidAmount) => {
    const document = accountingDocument();
    const admin = createRefreshAdmin(document, claim);
    mocks.createAdminSupabaseClient.mockResolvedValue(admin.client);
    mocks.getXeroInvoice.mockResolvedValue([invoice]);

    const result = await refreshXeroSalesInvoiceStatus({
      organizationId: "org-1", documentId: "document-1", workerJobId: "job-1",
    });

    expect(result).toMatchObject({ claimProjectionApplied: true, claimStatus: status, claimPaidAmount: paidAmount });
    expect(admin.claim).toMatchObject({ status, paid_amount: paidAmount });
    expect(admin.updates.map((entry) => entry.table)).toEqual([
      "organization_accounting_documents",
      "project_claims",
    ]);
  });

  it.each(["Draft", "Cancelled"])("persists Xero state but protects a %s claim", async (status) => {
    const document = accountingDocument();
    const admin = createRefreshAdmin(document, { status, paid_amount: 25 });
    mocks.createAdminSupabaseClient.mockResolvedValue(admin.client);
    mocks.getXeroInvoice.mockResolvedValue([xeroInvoice({ Status: "PAID", AmountPaid: 115, AmountDue: 0 })]);

    const result = await refreshXeroSalesInvoiceStatus({
      organizationId: "org-1", documentId: "document-1", workerJobId: "job-1",
    });

    expect(result.claimProjectionApplied).toBe(false);
    expect(admin.claim).toMatchObject({ status, paid_amount: 25 });
    expect(admin.updates.every((entry) => entry.table !== "project_claims")).toBe(true);
  });

  it.each([
    ["wrong type", { Type: "ACCPAY" }, "invoice_identity_mismatch"],
    ["wrong InvoiceID", { InvoiceID: "other" }, "invoice_identity_mismatch"],
    ["wrong claim invoice number", { InvoiceNumber: "PC-OTHER" }, "invoice_identity_mismatch"],
  ])("rejects %s before payment persistence", async (_label, overrides, code) => {
    const document = accountingDocument();
    const admin = createRefreshAdmin(document);
    mocks.createAdminSupabaseClient.mockResolvedValue(admin.client);
    mocks.getXeroInvoice.mockResolvedValue([xeroInvoice(overrides as Partial<XeroInvoice>)]);
    await expect(refreshXeroSalesInvoiceStatus({
      organizationId: "org-1", documentId: "document-1", workerJobId: "job-1",
    })).rejects.toMatchObject({ code });
    expect(admin.updates).toHaveLength(0);
  });

  it.each([
    ["connection", { id: "other", tenant_id: "tenant-1" }],
    ["tenant", { id: "conn-1", tenant_id: "tenant-other" }],
  ])("rejects a %s mismatch before Xero retrieval", async (label, connection) => {
    expect(["connection", "tenant"]).toContain(label);
    const admin = createRefreshAdmin(accountingDocument());
    mocks.createAdminSupabaseClient.mockResolvedValue(admin.client);
    mocks.getFreshXeroAccessToken.mockResolvedValue({ connection, tokenSet: { access_token: "access-token" } });
    await expect(refreshXeroSalesInvoiceStatus({
      organizationId: "org-1", documentId: "document-1", workerJobId: "job-1",
    })).rejects.toMatchObject({ code: "connection_mismatch" });
    expect(mocks.getXeroInvoice).not.toHaveBeenCalled();
  });

  it("handles a missing Xero invoice without clearing its stored identity", async () => {
    const document = accountingDocument();
    const admin = createRefreshAdmin(document);
    mocks.createAdminSupabaseClient.mockResolvedValue(admin.client);
    mocks.getXeroInvoice.mockResolvedValue([]);
    let error: unknown;
    try {
      await refreshXeroSalesInvoiceStatus({
        organizationId: "org-1", documentId: "document-1", workerJobId: "job-1",
      });
    } catch (caught) {
      error = caught;
    }
    await recordXeroSalesInvoiceRefreshError({ organizationId: "org-1", documentId: "document-1", error });
    expect(document).toMatchObject({
      external_document_id: "invoice-1",
      amount_paid: 0,
      amount_due: 115,
      last_status_sync_error: "The linked Xero Sales Invoice could not be found.",
    });
  });

  it.each(["VOIDED", "DELETED"])("persists %s provider values as attention required", async (status) => {
    const document = accountingDocument();
    const admin = createRefreshAdmin(document);
    mocks.createAdminSupabaseClient.mockResolvedValue(admin.client);
    mocks.getXeroInvoice.mockResolvedValue([xeroInvoice({ Status: status, AmountDue: 0 })]);
    const result = await refreshXeroSalesInvoiceStatus({
      organizationId: "org-1", documentId: "document-1", workerJobId: "job-1",
    });
    expect(result.attentionRequired).toBe(true);
    expect(document.last_status_sync_error).toContain("voided or deleted");
    expect(admin.claim).toMatchObject({ status: "Submitted", paid_amount: 0 });
    expect(result.claimProjectionApplied).toBe(false);
  });

  it("preserves inbound values but marks attention when Xero total diverges", async () => {
    const document = accountingDocument();
    const admin = createRefreshAdmin(document);
    mocks.createAdminSupabaseClient.mockResolvedValue(admin.client);
    mocks.getXeroInvoice.mockResolvedValue([xeroInvoice({ Total: 120, AmountPaid: 40, AmountDue: 80 })]);
    const result = await refreshXeroSalesInvoiceStatus({
      organizationId: "org-1", documentId: "document-1", workerJobId: "job-1",
    });
    expect(result).toMatchObject({ attentionRequired: true, totalDiverged: true });
    expect(document).toMatchObject({ amount_exported: 115, amount_paid: 40, amount_due: 80 });
    expect(document.last_status_sync_error).toContain("no longer matches");
  });

  it("records a safe failure without changing previous successful payment values or claim fields", async () => {
    const document = accountingDocument({ amount_paid: 25, amount_due: 90 });
    const admin = createRefreshAdmin(document);
    mocks.createAdminSupabaseClient.mockResolvedValue(admin.client);
    await recordXeroSalesInvoiceRefreshError({
      organizationId: "org-1", documentId: "document-1", error: new Error("private provider detail"),
    });
    expect(document).toMatchObject({ amount_paid: 25, amount_due: 90, external_document_id: "invoice-1" });
    expect(document.last_status_sync_error).toBe("Unable to refresh the Xero Sales Invoice right now.");
    expect(admin.updates.every((entry) => entry.table !== "project_claims")).toBe(true);
    expect(admin.updates.flatMap((entry) => Object.keys(entry.values))).not.toContain("paid_amount");
    expect(admin.updates.flatMap((entry) => Object.keys(entry.values))).not.toContain("status");
  });
});

function createEnqueueAdmin(document: Row, initialJobs: Row[] = []) {
  const jobs = [...initialJobs];
  return {
    jobs,
    client: {
      from(table: string) {
        if (table === "organization_accounting_documents") {
          const builder = {
            select() { return builder; },
            eq() { return builder; },
            in() { return builder; },
            maybeSingle: async () => ({ data: document, error: null }),
          };
          return builder;
        }
        const builder = {
          select() { return builder; },
          eq() { return builder; },
          in() { return builder; },
          contains() { return builder; },
          order() { return builder; },
          limit() { return Promise.resolve({ data: jobs, error: null }); },
          insert(values: Row) {
            const row = { id: `job-${jobs.length + 1}`, queue_state: "pending", ...values };
            jobs.push(row);
            return { select: () => ({ single: async () => ({ data: row, error: null }) }) };
          },
        };
        return builder;
      },
    },
  };
}

describe("ACCREC refresh enqueue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOrganizationXeroConnection.mockResolvedValue({
      id: "conn-1", tenant_id: "tenant-1", status: "connected",
    });
    mocks.getCurrentOrganizationMember.mockResolvedValue({ id: "member-1", organization_id: "org-1", user_id: "user-1" });
    mocks.hasOrganizationPermission.mockResolvedValue(true);
    mocks.getOrganizationPermissionsBatch.mockResolvedValue({
      "accounting.sales_invoices.view": true,
      "accounting.sales_invoices.manage": true,
      "accounting.sales_invoices.push": true,
    });
    mocks.isPaymentClaimInitialPushEnabled.mockResolvedValue(true);
  });

  it("deduplicates repeated refresh clicks", async () => {
    const admin = createEnqueueAdmin(accountingDocument());
    mocks.createAdminSupabaseClient.mockResolvedValue(admin.client);
    const first = await enqueueXeroSalesInvoiceRefresh({
      organizationId: "org-1", documentId: "document-1", createdByUserId: "user-1", triggerSource: "manual_refresh",
    });
    const second = await enqueueXeroSalesInvoiceRefresh({
      organizationId: "org-1", documentId: "document-1", createdByUserId: "user-1", triggerSource: "manual_refresh",
    });
    expect(first.created).toBe(true);
    expect(second).toMatchObject({ jobId: first.jobId, created: false });
    expect(admin.jobs).toHaveLength(1);
  });

  it("rejects refresh while an outbound sync job is active", async () => {
    const admin = createEnqueueAdmin(accountingDocument(), [{
      id: "sync-job", job_kind: "xero.sales_invoice.sync", queue_state: "claimed",
      request_payload: { accountingDocumentId: "document-1" },
    }]);
    mocks.createAdminSupabaseClient.mockResolvedValue(admin.client);
    await expect(enqueueXeroSalesInvoiceRefresh({
      organizationId: "org-1", documentId: "document-1", createdByUserId: "user-1", triggerSource: "manual_refresh",
    })).rejects.toMatchObject({ code: "sync_in_progress" });
    expect(admin.jobs).toHaveLength(1);
  });

  it("allows immediate status verification while an attachment job is pending", async () => {
    const admin = createEnqueueAdmin(accountingDocument(), [{
      id: "attachment-job",
      job_kind: "xero.payment_claim.initial_push.attachment",
      queue_state: "pending",
      request_payload: { accountingDocumentId: "document-1" },
    }]);
    mocks.createAdminSupabaseClient.mockResolvedValue(admin.client);
    const result = await enqueueXeroSalesInvoiceRefresh({
      organizationId: "org-1",
      documentId: "document-1",
      createdByUserId: "user-1",
      triggerSource: "manual_refresh",
    });
    expect(result.created).toBe(true);
    expect(admin.jobs.map((job) => job.job_kind)).toContain("xero.sales_invoice.refresh");
  });

  it("manual refresh resolves the accounting document and job payload server-side", async () => {
    const admin = createEnqueueAdmin(accountingDocument());
    mocks.createAdminSupabaseClient.mockResolvedValue(admin.client);
    const result = await enqueuePaymentClaimXeroRefreshForCurrentUser({ claimId: "claim-1" });
    expect(result.organizationId).toBe("org-1");
    expect(admin.jobs[0]).toMatchObject({
      job_kind: "xero.sales_invoice.refresh",
      request_payload: { accountingDocumentId: "document-1" },
    });
  });
});
