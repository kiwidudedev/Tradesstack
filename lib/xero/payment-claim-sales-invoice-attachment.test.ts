import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  createAdminSupabaseClient: vi.fn(),
  getFreshXeroAccessToken: vi.fn(),
  getOrganizationXeroConnection: vi.fn(),
  getXeroInvoice: vi.fn(),
  putXeroInvoiceAttachment: vi.fn(),
  resolvePaymentClaimXeroReadinessContext: vi.fn(),
  buildPayload: vi.fn(),
  buildHash: vi.fn(),
  generatePdf: vi.fn(),
  getCurrentOrganizationMember: vi.fn(),
  hasOrganizationPermission: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabaseClient: mocks.createAdminSupabaseClient }));
vi.mock("@/lib/xero/service", () => ({
  getFreshXeroAccessToken: mocks.getFreshXeroAccessToken,
  getOrganizationXeroConnection: mocks.getOrganizationXeroConnection,
}));
vi.mock("@/lib/xero/client", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/xero/client")>(),
  getXeroInvoice: mocks.getXeroInvoice,
  putXeroInvoiceAttachment: mocks.putXeroInvoiceAttachment,
}));
vi.mock("@/lib/xero/payment-claim-readiness", () => ({
  resolvePaymentClaimXeroReadinessContext: mocks.resolvePaymentClaimXeroReadinessContext,
}));
vi.mock("@/lib/xero/payment-claim-sales-invoice-payload", () => ({
  buildPaymentClaimXeroPayloadFromResolvedSnapshot: mocks.buildPayload,
}));
vi.mock("@/lib/xero/payment-claim-sales-invoice-hash", () => ({
  buildPaymentClaimXeroCurrentStateHashFromPayload: mocks.buildHash,
}));
vi.mock("@/lib/exports/payment-claim-pdf-server", () => ({
  generatePaymentClaimPdfBundleServer: mocks.generatePdf,
}));
vi.mock("@/lib/projects-server", () => ({ getCurrentOrganizationMember: mocks.getCurrentOrganizationMember }));
vi.mock("@/lib/permissions-server", () => ({ hasOrganizationPermission: mocks.hasOrganizationPermission }));

import {
  attachPaymentClaimPdfToXeroSalesInvoice,
  enqueuePaymentClaimXeroAttachmentForCurrentUser,
  enqueueXeroSalesInvoiceAttachment,
  recordXeroSalesInvoiceAttachmentError,
} from "./payment-claim-sales-invoice-attachment";

type Row = Record<string, unknown>;
const HASH = "a".repeat(64);

function document(overrides: Row = {}): Row {
  return {
    id: "document-1",
    organization_id: "org-1",
    accounting_connection_id: "conn-1",
    provider: "xero",
    tenant_id: "tenant-1",
    local_document_type: "project_claim",
    local_document_id: null,
    current_version_id: null,
    project_claim_id: "claim-1",
    external_document_id: "invoice-1",
    external_document_number: "PC-0042",
    amount_exported: 115,
    last_synced_hash: HASH,
    export_status: "exported",
    attachment_status: "not_attached",
    attachment_filename: null,
    attachment_synced_hash: null,
    ...overrides,
  };
}

function createAdmin(initialDocument = document(), initialJobs: Row[] = []) {
  const jobs = [...initialJobs];
  const updates: Array<{ table: string; values: Row }> = [];
  const client = {
    from(table: string) {
      const rows = table === "organization_accounting_documents" ? [initialDocument] : jobs;
      const filters: Array<(row: Row) => boolean> = [];
      let values: Row | null = null;
      const matching = () => rows.filter((row) => filters.every((filter) => filter(row)));
      const builder = {
        select() { return builder; },
        eq(field: string, value: unknown) { filters.push((row) => row[field] === value); return builder; },
        in(field: string, allowed: unknown[]) { filters.push((row) => allowed.includes(row[field])); return builder; },
        order() { return builder; },
        update(next: Row) { values = next; return builder; },
        insert(next: Row) {
          const row = { id: `job-${jobs.length + 1}`, queue_state: "pending", created_at: new Date().toISOString(), ...next };
          jobs.push(row);
          return { select: () => ({ single: async () => ({ data: row, error: null }) }) };
        },
        maybeSingle() {
          const row = matching()[0] ?? null;
          if (row && values) {
            updates.push({ table, values });
            Object.assign(row, values);
          }
          return Promise.resolve({ data: row, error: null });
        },
        then(resolve: (value: { data: Row[]; error: null }) => unknown) {
          if (values) matching().forEach((row) => { updates.push({ table, values: values! }); Object.assign(row, values); });
          return Promise.resolve({ data: matching(), error: null }).then(resolve);
        },
      };
      return builder;
    },
  };
  return { client, document: initialDocument, jobs, updates };
}

function snapshot(doc = document()) {
  return {
    organization: { id: "org-1" },
    claim: { id: "claim-1", claim_number: "PC-0042" },
    project: { id: "project-1" },
    client: { id: "client-1" },
    connection: { id: "conn-1", tenant_id: "tenant-1" },
    contactLinks: [], importedContacts: [], mappings: [], costCodes: [], taxRates: [],
    accountingDocuments: [doc],
  };
}

describe("Payment Claim Xero PDF attachment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getFreshXeroAccessToken.mockResolvedValue({
      connection: { id: "conn-1", tenant_id: "tenant-1", scope: ["accounting.invoices", "accounting.attachments"] },
      tokenSet: { access_token: "access-token" },
    });
    mocks.getOrganizationXeroConnection.mockResolvedValue({
      id: "conn-1", tenant_id: "tenant-1", status: "connected", scope: ["accounting.attachments"],
    });
    mocks.getXeroInvoice.mockResolvedValue([{ InvoiceID: "invoice-1", InvoiceNumber: "PC-0042", Type: "ACCREC" }]);
    mocks.buildPayload.mockReturnValue({ payload: {}, reconciliation: { total: 115 } });
    mocks.buildHash.mockReturnValue({ hash: HASH });
    mocks.generatePdf.mockResolvedValue({
      bytes: new TextEncoder().encode("%PDF-1.4 current claim bundle"),
      statutoryDocumentsIncluded: [{ id: "nz-payment-claim-form-1" }],
    });
    mocks.putXeroInvoiceAttachment.mockResolvedValue([{
      AttachmentID: "attachment-1",
      FileName: "Payment-Claim-PC-0042.pdf",
      Url: "https://api.xero.com/api.xro/2.0/Invoices/invoice-1/Attachments/Payment-Claim-PC-0042.pdf",
    }]);
    mocks.getCurrentOrganizationMember.mockResolvedValue({ organization_id: "org-1", user_id: "user-1" });
    mocks.hasOrganizationPermission.mockResolvedValue(true);
  });

  it("targets the exact stored ACCREC InvoiceID and persists the matching PDF state", async () => {
    const store = createAdmin();
    mocks.createAdminSupabaseClient.mockResolvedValue(store.client);
    mocks.resolvePaymentClaimXeroReadinessContext.mockResolvedValue({ snapshot: snapshot(store.document), terminalReadiness: null });
    const result = await attachPaymentClaimPdfToXeroSalesInvoice({
      organizationId: "org-1", accountingDocumentId: "document-1", workerJobId: "job-1",
    });
    expect(mocks.getXeroInvoice).toHaveBeenCalledWith("access-token", "tenant-1", "invoice-1");
    expect(mocks.generatePdf).toHaveBeenCalledWith({ organizationId: "org-1", claimId: "claim-1" });
    expect(mocks.putXeroInvoiceAttachment).toHaveBeenCalledWith(expect.objectContaining({
      invoiceId: "invoice-1", fileName: "Payment-Claim-PC-0042.pdf", includeOnline: true,
    }));
    expect(result).toMatchObject({ fileName: "Payment-Claim-PC-0042.pdf", syncedHash: HASH });
    expect(store.document).toMatchObject({
      external_document_id: "invoice-1",
      attachment_status: "attached",
      attachment_filename: "Payment-Claim-PC-0042.pdf",
      attachment_synced_hash: HASH,
      attachment_error_message: null,
    });
  });

  it.each([
    ["supplier document", { local_document_type: "supplier_invoice", local_document_id: "supplier-1" }, "invalid_document"],
    ["missing InvoiceID", { external_document_id: null }, "missing_invoice"],
  ])("rejects a %s before Xero or PDF work", async (_label, overrides, code) => {
    const store = createAdmin(document(overrides));
    mocks.createAdminSupabaseClient.mockResolvedValue(store.client);
    await expect(attachPaymentClaimPdfToXeroSalesInvoice({
      organizationId: "org-1", accountingDocumentId: "document-1", workerJobId: "job-1",
    })).rejects.toMatchObject({ code });
    expect(mocks.getXeroInvoice).not.toHaveBeenCalled();
    expect(mocks.generatePdf).not.toHaveBeenCalled();
  });

  it("blocks an unsynced amendment before PDF generation or upload", async () => {
    const store = createAdmin();
    mocks.createAdminSupabaseClient.mockResolvedValue(store.client);
    mocks.resolvePaymentClaimXeroReadinessContext.mockResolvedValue({ snapshot: snapshot(store.document), terminalReadiness: null });
    mocks.buildHash.mockReturnValue({ hash: "b".repeat(64) });
    await expect(attachPaymentClaimPdfToXeroSalesInvoice({
      organizationId: "org-1", accountingDocumentId: "document-1", workerJobId: "job-1",
    })).rejects.toMatchObject({ code: "claim_changes_unsynced" });
    expect(mocks.generatePdf).not.toHaveBeenCalled();
    expect(mocks.putXeroInvoiceAttachment).not.toHaveBeenCalled();
  });

  it.each([
    ["wrong type", { Type: "ACCPAY" }],
    ["wrong InvoiceID", { InvoiceID: "invoice-other" }],
    ["wrong number", { InvoiceNumber: "PC-OTHER" }],
  ])("rejects %s returned by Xero", async (_label, override) => {
    const store = createAdmin();
    mocks.createAdminSupabaseClient.mockResolvedValue(store.client);
    mocks.resolvePaymentClaimXeroReadinessContext.mockResolvedValue({ snapshot: snapshot(store.document), terminalReadiness: null });
    mocks.getXeroInvoice.mockResolvedValue([{ InvoiceID: "invoice-1", InvoiceNumber: "PC-0042", Type: "ACCREC", ...override }]);
    await expect(attachPaymentClaimPdfToXeroSalesInvoice({
      organizationId: "org-1", accountingDocumentId: "document-1", workerJobId: "job-1",
    })).rejects.toMatchObject({ code: "invoice_identity_mismatch" });
  });

  it("uses the same deterministic filename for an identical retry", async () => {
    const store = createAdmin();
    mocks.createAdminSupabaseClient.mockResolvedValue(store.client);
    mocks.resolvePaymentClaimXeroReadinessContext.mockResolvedValue({ snapshot: snapshot(store.document), terminalReadiness: null });
    await attachPaymentClaimPdfToXeroSalesInvoice({ organizationId: "org-1", accountingDocumentId: "document-1", workerJobId: "job-1" });
    await attachPaymentClaimPdfToXeroSalesInvoice({ organizationId: "org-1", accountingDocumentId: "document-1", workerJobId: "job-2" });
    expect(mocks.putXeroInvoiceAttachment.mock.calls.map((call) => call[0].fileName)).toEqual([
      "Payment-Claim-PC-0042.pdf", "Payment-Claim-PC-0042.pdf",
    ]);
  });

  it("records safe failure without changing InvoiceID, invoice state, or successful attachment metadata", async () => {
    const store = createAdmin(document({
      attachment_status: "attached", attachment_filename: "Payment-Claim-PC-0042.pdf",
      attachment_synced_hash: HASH, attachment_uploaded_at: "2026-07-22T01:00:00Z",
    }));
    mocks.createAdminSupabaseClient.mockResolvedValue(store.client);
    await recordXeroSalesInvoiceAttachmentError({
      organizationId: "org-1", documentId: "document-1", error: new Error("private detail"),
    });
    expect(store.document).toMatchObject({
      external_document_id: "invoice-1", export_status: "exported",
      attachment_filename: "Payment-Claim-PC-0042.pdf", attachment_synced_hash: HASH,
      attachment_status: "failed", attachment_error_message: "Unable to attach the Payment Claim PDF in Xero right now.",
    });
  });
});

describe("Payment Claim attachment enqueue", () => {
  beforeEach(() => {
    mocks.getOrganizationXeroConnection.mockResolvedValue({
      id: "conn-1", tenant_id: "tenant-1", status: "connected", scope: ["accounting.attachments"],
    });
    mocks.buildPayload.mockReturnValue({ payload: {}, reconciliation: { total: 115 } });
    mocks.buildHash.mockReturnValue({ hash: HASH });
    mocks.getCurrentOrganizationMember.mockResolvedValue({ organization_id: "org-1", user_id: "user-1" });
    mocks.hasOrganizationPermission.mockResolvedValue(true);
  });

  it("deduplicates active attachment clicks and blocks an active financial sync", async () => {
    const store = createAdmin();
    mocks.createAdminSupabaseClient.mockResolvedValue(store.client);
    mocks.resolvePaymentClaimXeroReadinessContext.mockResolvedValue({ snapshot: snapshot(store.document), terminalReadiness: null });
    const first = await enqueueXeroSalesInvoiceAttachment({
      organizationId: "org-1", accountingDocumentId: "document-1", createdByUserId: "user-1", triggerSource: "user_export",
    });
    const second = await enqueueXeroSalesInvoiceAttachment({
      organizationId: "org-1", accountingDocumentId: "document-1", createdByUserId: "user-1", triggerSource: "user_retry",
    });
    expect(second).toMatchObject({ jobId: first.jobId, created: false });
    const blocked = createAdmin(document(), [{
      id: "sync-1", organization_id: "org-1", provider: "xero",
      job_kind: "xero.sales_invoice.sync", queue_state: "claimed",
      request_payload: { accountingDocumentId: "document-1" },
    }]);
    mocks.createAdminSupabaseClient.mockResolvedValue(blocked.client);
    mocks.resolvePaymentClaimXeroReadinessContext.mockResolvedValue({ snapshot: snapshot(blocked.document), terminalReadiness: null });
    await expect(enqueueXeroSalesInvoiceAttachment({
      organizationId: "org-1", accountingDocumentId: "document-1", createdByUserId: "user-1", triggerSource: "user_export",
    })).rejects.toMatchObject({ code: "sync_in_progress" });
  });

  it("resolves browser identifiers server-side and rejects an unauthorized user", async () => {
    const store = createAdmin();
    mocks.createAdminSupabaseClient.mockResolvedValue(store.client);
    mocks.resolvePaymentClaimXeroReadinessContext.mockResolvedValue({ snapshot: snapshot(store.document), terminalReadiness: null });
    await enqueuePaymentClaimXeroAttachmentForCurrentUser({ claimId: "claim-1", intent: "attach" });
    expect(store.jobs[0]).toMatchObject({
      job_kind: "xero.sales_invoice.attachment",
      request_payload: { accountingDocumentId: "document-1" },
    });
    mocks.hasOrganizationPermission.mockResolvedValue(false);
    await expect(enqueuePaymentClaimXeroAttachmentForCurrentUser({
      claimId: "claim-1", intent: "retry_attachment",
    })).rejects.toMatchObject({ code: "unauthorized" });
  });
});
