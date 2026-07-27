import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  createAdminSupabaseClient: vi.fn(),
  getCurrentOrganizationMember: vi.fn(),
  hasOrganizationPermission: vi.fn(),
  resolvePaymentClaimXeroReadinessContext: vi.fn(),
  evaluatePaymentClaimXeroReadinessSnapshot: vi.fn(),
  resolvePaymentClaimXeroDependencies: vi.fn(),
  buildPaymentClaimXeroPayloadFromResolvedSnapshot: vi.fn(),
  buildPaymentClaimXeroCurrentStateHashFromPayload: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabaseClient: mocks.createAdminSupabaseClient }));
vi.mock("@/lib/projects-server", () => ({ getCurrentOrganizationMember: mocks.getCurrentOrganizationMember }));
vi.mock("@/lib/permissions-server", () => ({ hasOrganizationPermission: mocks.hasOrganizationPermission }));
vi.mock("@/lib/xero/payment-claim-readiness", () => ({
  resolvePaymentClaimXeroReadinessContext: mocks.resolvePaymentClaimXeroReadinessContext,
  evaluatePaymentClaimXeroReadinessSnapshot: mocks.evaluatePaymentClaimXeroReadinessSnapshot,
  resolvePaymentClaimXeroDependencies: mocks.resolvePaymentClaimXeroDependencies,
}));
vi.mock("@/lib/xero/payment-claim-sales-invoice-payload", () => ({
  buildPaymentClaimXeroPayloadFromResolvedSnapshot: mocks.buildPaymentClaimXeroPayloadFromResolvedSnapshot,
}));
vi.mock("@/lib/xero/payment-claim-sales-invoice-hash", () => ({
  buildPaymentClaimXeroCurrentStateHashFromPayload: mocks.buildPaymentClaimXeroCurrentStateHashFromPayload,
}));

import {
  derivePaymentClaimXeroPanelState,
  enqueuePaymentClaimXeroSync,
} from "./payment-claim-sales-invoice-panel";

type Row = Record<string, unknown>;

function createAdminStore(initialDocuments: Row[] = [], initialJobs: Row[] = []) {
  const documents = [...initialDocuments];
  const jobs = [...initialJobs];
  let id = 0;

  function from(table: string) {
    const rows = table === "organization_accounting_documents" ? documents : jobs;
    const filters: Array<(row: Row) => boolean> = [];
    let updateValues: Row | null = null;
    const matching = () => rows.filter((row) => filters.every((filter) => filter(row)));
    const builder = {
      select() { return builder; },
      eq(field: string, value: unknown) {
        filters.push((row) => {
          const jsonTextField = field.match(/^([^>]+)->>(.+)$/);
          if (!jsonTextField) return row[field] === value;
          const nested = row[jsonTextField[1]];
          return Boolean(
            nested
            && typeof nested === "object"
            && (nested as Row)[jsonTextField[2]] === value,
          );
        });
        return builder;
      },
      in(field: string, values: unknown[]) {
        filters.push((row) => values.includes(row[field]));
        return builder;
      },
      contains(field: string, value: Row) {
        filters.push((row) => {
          const found = row[field];
          return Boolean(
            found
            && typeof found === "object"
            && Object.entries(value).every(
              ([key, expected]) => (found as Row)[key] === expected,
            ),
          );
        });
        return builder;
      },
      order() { return builder; },
      limit() { return builder; },
      insert(values: Row) {
        const row = {
          id: table === "organization_accounting_documents" ? `document-${++id}` : `job-${++id}`,
          created_at: "2026-07-22T00:00:00.000Z",
          queue_state: table === "organization_accounting_sync_jobs" ? "pending" : undefined,
          ...values,
        };
        rows.push(row);
        return {
          select() {
            return { single: async () => ({ data: row, error: null }) };
          },
        };
      },
      update(values: Row) { updateValues = values; return builder; },
      maybeSingle() {
        const row = matching()[0] ?? null;
        if (row && updateValues) Object.assign(row, updateValues);
        return Promise.resolve({ data: row, error: null });
      },
      then(resolve: (value: { data: Row[]; error: null }) => unknown) {
        return Promise.resolve({ data: matching(), error: null }).then(resolve);
      },
    };
    return builder;
  }

  return { documents, jobs, client: { from } };
}

function document(overrides: Row = {}): Row {
  return {
    id: "document-existing",
    organization_id: "org-1",
    accounting_connection_id: "conn-1",
    provider: "xero",
    tenant_id: "tenant-1",
    local_document_type: "project_claim",
    local_document_id: null,
    project_claim_id: "claim-1",
    current_version_id: null,
    export_status: "not_ready",
    external_document_id: null,
    ...overrides,
  };
}

function snapshot(documents: Row[]) {
  return {
    organization: { id: "org-1" },
    claim: { id: "claim-1", status: "Submitted" },
    project: { id: "project-1" },
    client: { id: "client-1" },
    connection: { id: "conn-1", tenant_id: "tenant-1" },
    contactLinks: [], importedContacts: [], mappings: [], costCodes: [], taxRates: [],
    accountingDocuments: documents,
  };
}

describe("Payment Claim Xero Stage 7 panel state", () => {
  const ready = { ready: true, blockers: [] };
  const notReady = { ready: false, blockers: [{ code: "claim_not_submitted", message: "Payment Claim must be Submitted." }] };

  it.each([
    ["Not ready", notReady, null, null, null, "hash-current", "not_ready", null],
    ["Ready to sync", ready, null, null, null, "hash-current", "ready_to_sync", null],
    ["Queued", ready, document(), { queue_state: "pending" }, null, "hash-current", "queued", null],
    ["Syncing", ready, document(), { queue_state: "claimed" }, null, "hash-current", "syncing", null],
    ["Synced", ready, document({ external_document_id: "invoice-1", last_synced_hash: "hash-current" }), null, null, "hash-current", "synced", null],
    ["Update pending", ready, document({ external_document_id: "invoice-1", last_synced_hash: "hash-old" }), null, null, "hash-current", "update_pending", null],
    ["Attention required", ready, document({ export_status: "attention_required" }), null, null, "hash-current", "attention_required", null],
    ["Dead letter", ready, document(), null, { queue_state: "dead_lettered" }, "hash-current", "attention_required", null],
  ])("derives %s", (_label, readiness, doc, activeJob, latestJob, currentHash, status, actionLabel) => {
    const result = derivePaymentClaimXeroPanelState({
      canManage: true,
      readiness: readiness as never,
      document: doc,
      activeJob,
      latestJob,
      currentHash,
    });
    expect(result.status).toBe(status);
    expect(result.actionLabel).toBe(actionLabel);
  });

  it("exposes only Push to Xero when the server decision permits it", () => {
    const result = derivePaymentClaimXeroPanelState({
      canManage: true,
      readiness: ready as never,
      document: null,
      activeJob: null,
      latestJob: null,
      currentHash: "hash-current",
      accountingDecision: {
        operation: "INITIAL_EXPORT",
        canPush: true,
        proposalType: "initial",
        confirmationTitle: "Review authorised Xero invoice",
        confirmationMessage: "This will create an authorised sales invoice in Xero.",
        workerKind: "xero.payment_claim.initial_push",
        replacementNumber: null,
        blockers: [],
        warnings: [],
        accountingState: "ready_for_initial_export",
      },
    });
    expect(result.actionLabel).toBe("Push to Xero");
  });

  it("shows a deleted provider invoice as missing without erasing its historical identity", () => {
    const result = derivePaymentClaimXeroPanelState({
      canManage: true,
      readiness: ready as never,
      document: document({
        external_document_id: "invoice-deleted",
        external_document_number: "26028-CL-01",
        last_status_sync_error: "The linked Xero Sales Invoice could not be found.",
        last_status_synced_at: "2026-07-25T01:00:00.000Z",
      }),
      activeJob: null,
      latestJob: null,
      currentHash: "hash-current",
    });

    expect(result).toMatchObject({
      status: "missing_in_xero",
      statusLabel: "Missing in Xero",
      invoiceNumber: "26028-CL-01",
      xeroUrl: null,
      paymentStatus: "attention_required",
      canRefresh: true,
      actionLabel: null,
    });
  });

  it("shows Xero's accounting-safe deletion response explicitly as voided", () => {
    const result = derivePaymentClaimXeroPanelState({
      canManage: true,
      readiness: ready as never,
      document: document({
        external_document_id: "invoice-voided",
        external_document_number: "26028-CL-01",
        normalized_external_status: "voided",
        last_status_sync_error: "The linked Xero Sales Invoice is voided or deleted.",
        last_status_synced_at: "2026-07-25T06:50:45.237Z",
      }),
      activeJob: null,
      latestJob: null,
      currentHash: "hash-current",
    });

    expect(result).toMatchObject({
      status: "voided_in_xero",
      statusLabel: "Voided in Xero",
      invoiceNumber: "26028-CL-01",
      paymentStatus: "attention_required",
      canRefresh: true,
      actionLabel: null,
    });
    expect(result.xeroUrl).toContain("invoice-voided");
  });

  function revisionBackedEvidence(overrides: {
    observation?: Row | null;
    revision?: Row | null;
    projection?: Row | null;
    document?: Row;
    activeAttachmentJob?: Row | null;
  } = {}) {
    const revision = overrides.revision === undefined ? {
      id: "revision-1",
      accounting_document_id: "document-existing",
      external_document_id: "invoice-1",
      external_document_number: "26028-CL-02",
      tenant_id: "tenant-1",
      connection_id: "conn-1",
      provider_content_hash: "content-hash",
      subtotal_minor: 10000,
      tax_minor: 1500,
      total_minor: 11500,
    } : overrides.revision;
    const observation = overrides.observation === undefined ? {
      id: "observation-1",
      accounting_document_id: "document-existing",
      accounting_revision_id: "revision-1",
      tenant_id: "tenant-1",
      external_document_id: "invoice-1",
      content_hash: "content-hash",
      observed_at: "2026-07-25T06:00:00Z",
      raw_observation: {
        Type: "ACCREC",
        InvoiceID: "invoice-1",
        InvoiceNumber: "26028-CL-02",
        SubTotal: 100,
        TotalTax: 15,
        Total: 115,
      },
    } : overrides.observation;
    const projection = overrides.projection === undefined ? {
      accounting_revision_id: "revision-1",
      remote_observation_id: "observation-1",
      normalized_invoice_status: "authorised",
      divergent: false,
    } : overrides.projection;
    return derivePaymentClaimXeroPanelState({
      canManage: true,
      readiness: ready as never,
      document: document({
        integration_contract: "payment_claim_revision_v1",
        active_accounting_revision_id: "revision-1",
        accounting_connection_id: "conn-1",
        tenant_id: "tenant-1",
        external_document_id: "invoice-1",
        external_document_number: "26028-CL-02",
        export_status: "exported",
        last_synced_hash: "hash-current",
        ...overrides.document,
      }),
      activeJob: null,
      latestJob: null,
      activeAttachmentJob: overrides.activeAttachmentJob,
      currentHash: "hash-current",
      activeRevision: revision,
      latestObservation: observation,
      projection,
    });
  }

  it("requires a verified active-revision observation instead of trusting a stored InvoiceID", () => {
    expect(revisionBackedEvidence({ observation: null, projection: null })).toMatchObject({
      status: "verification_required",
      statusLabel: "Verification required",
      canRefresh: true,
    });
  });

  it("shows Synced only for an exact active revision, tenant, invoice and financial match", () => {
    expect(revisionBackedEvidence()).toMatchObject({
      status: "synced",
      statusLabel: "Synced",
      canRefresh: true,
    });
  });

  it("does not show Synced for a wrong observation tenant", () => {
    const state = revisionBackedEvidence({
      observation: {
        id: "observation-1",
        accounting_document_id: "document-existing",
        accounting_revision_id: "revision-1",
        tenant_id: "tenant-other",
        external_document_id: "invoice-1",
        content_hash: "content-hash",
        raw_observation: {
          Type: "ACCREC",
          InvoiceID: "invoice-1",
          InvoiceNumber: "26028-CL-02",
          SubTotal: 100,
          TotalTax: 15,
          Total: 115,
        },
      },
    });
    expect(state.status).toBe("verification_required");
  });

  it("keeps Refresh available while a PDF attachment is pending", () => {
    expect(revisionBackedEvidence({
      observation: null,
      projection: null,
      activeAttachmentJob: { id: "attachment-job", queue_state: "pending" },
    }).canRefresh).toBe(true);
  });

  it("keeps void replacement available and suppresses stale invoice errors while a PDF attachment is pending", () => {
    const state = derivePaymentClaimXeroPanelState({
      canManage: true,
      readiness: ready as never,
      document: document({
        integration_contract: "payment_claim_revision_v1",
        active_accounting_revision_id: "revision-1",
        accounting_connection_id: "conn-1",
        tenant_id: "tenant-1",
        external_document_id: "invoice-1",
        external_document_number: "TSI-00000001",
        export_status: "exported",
        last_error_message: "A stale attachment error.",
      }),
      activeJob: null,
      latestJob: null,
      activeAttachmentJob: { id: "attachment-job", queue_state: "pending" },
      currentHash: "hash-current",
      activeRevision: {
        id: "revision-1",
        accounting_document_id: "document-existing",
        external_document_id: "invoice-1",
        external_document_number: "TSI-00000001",
        tenant_id: "tenant-1",
        connection_id: "conn-1",
      },
      latestObservation: {
        id: "observation-voided",
        accounting_revision_id: "revision-1",
        tenant_id: "tenant-1",
        external_document_id: "invoice-1",
        observed_at: "2026-07-25T08:16:15.555Z",
        raw_observation: {
          Type: "ACCREC",
          InvoiceID: "invoice-1",
          InvoiceNumber: "TSI-00000001",
          Status: "VOIDED",
        },
      },
      projection: {
        accounting_revision_id: "revision-1",
        remote_observation_id: "observation-voided",
        normalized_invoice_status: "voided",
        normalized_payment_status: "attention_required",
        divergent: false,
      },
      accountingDecision: {
        operation: "REPLACEMENT_EXPORT",
        canPush: true,
        proposalType: "replacement",
        confirmationTitle: "Review replacement authorised Xero invoice",
        confirmationMessage: "This will create a replacement authorised sales invoice.",
        workerKind: "xero.payment_claim.replacement",
        replacementNumber: "26028-CL-02-R1",
        blockers: [],
        warnings: [],
        accountingState: "ready_for_replacement_after_void",
      },
    });

    expect(state).toMatchObject({
      status: "voided_in_xero",
      actionLabel: "Push to Xero",
      canRefresh: true,
      attachmentInProgress: true,
      safeErrorMessage: null,
      message: "The linked Xero Sales Invoice is voided. Push the Payment Claim to Xero to create a new authorised invoice.",
    });
  });

  it("keeps void replacement available when the predecessor PDF attachment failed", () => {
    const result = revisionBackedEvidence({
      document: {
        attachment_status: "failed",
        attachment_error_message: "The previous invoice PDF attachment did not complete.",
      },
      projection: {
        accounting_revision_id: "revision-1",
        remote_observation_id: "observation-1",
        normalized_invoice_status: "voided",
        normalized_payment_status: "attention_required",
        divergent: false,
      },
    });

    expect(result).toMatchObject({
      status: "voided_in_xero",
      canRefresh: true,
      attachmentStatus: "failed",
      attachmentInProgress: false,
    });
  });
});

describe("Payment Claim Xero Stage 7 enqueue", () => {
  let store: ReturnType<typeof createAdminStore>;

  beforeEach(() => {
    vi.clearAllMocks();
    store = createAdminStore();
    mocks.createAdminSupabaseClient.mockResolvedValue(store.client);
    mocks.getCurrentOrganizationMember.mockResolvedValue({ organization_id: "org-1", user_id: "user-1" });
    mocks.hasOrganizationPermission.mockResolvedValue(true);
    mocks.resolvePaymentClaimXeroReadinessContext.mockImplementation(async () => ({
      snapshot: snapshot(store.documents), terminalReadiness: null,
    }));
    mocks.evaluatePaymentClaimXeroReadinessSnapshot.mockReturnValue({ ready: true, blockers: [] });
    mocks.resolvePaymentClaimXeroDependencies.mockReturnValue({ connectionId: "conn-1", tenantId: "tenant-1" });
    mocks.buildPaymentClaimXeroPayloadFromResolvedSnapshot.mockReturnValue({ payload: {}, reconciliation: {} });
    mocks.buildPaymentClaimXeroCurrentStateHashFromPayload.mockReturnValue({ hash: "server-hash" });
  });

  it("creates one accounting document and queues one server-hashed sync job", async () => {
    const result = await enqueuePaymentClaimXeroSync({ claimId: "claim-1" });
    expect(result).toMatchObject({ status: "queued", reusedActiveJob: false });
    expect(store.documents).toHaveLength(1);
    expect(store.documents[0]).toMatchObject({
      organization_id: "org-1",
      local_document_type: "project_claim",
      project_claim_id: "claim-1",
      local_document_id: null,
      export_status: "queued",
    });
    expect(store.jobs).toHaveLength(1);
    expect(store.jobs[0]).toMatchObject({
      job_kind: "xero.sales_invoice.sync",
      connection_id: "conn-1",
      request_payload: {
        accountingDocumentId: result.accountingDocumentId,
        queuedHash: "server-hash",
      },
    });
  });

  it("reuses the accounting document and active job across duplicate clicks", async () => {
    const existing = document();
    store = createAdminStore([existing]);
    mocks.createAdminSupabaseClient.mockResolvedValue(store.client);
    const first = await enqueuePaymentClaimXeroSync({ claimId: "claim-1" });
    const second = await enqueuePaymentClaimXeroSync({ claimId: "claim-1" });
    expect(first.jobId).toBe(second.jobId);
    expect(second.reusedActiveJob).toBe(true);
    expect(store.documents).toHaveLength(1);
    expect(store.jobs).toHaveLength(1);
  });

  it("queues the same job kind for an existing InvoiceID", async () => {
    const existing = document({ external_document_id: "invoice-1", last_synced_hash: "old-hash" });
    store = createAdminStore([existing]);
    mocks.createAdminSupabaseClient.mockResolvedValue(store.client);
    await enqueuePaymentClaimXeroSync({ claimId: "claim-1" });
    expect(store.jobs[0]).toMatchObject({
      job_kind: "xero.sales_invoice.sync",
      request_payload: { accountingDocumentId: "document-existing", queuedHash: "server-hash" },
    });
  });

  it("marks the same enqueue action as a user retry after a dead-lettered job", async () => {
    const existing = document({ export_status: "queued" });
    store = createAdminStore([existing], [{
      id: "job-old",
      organization_id: "org-1",
      provider: "xero",
      job_kind: "xero.sales_invoice.sync",
      queue_state: "dead_lettered",
      request_payload: { accountingDocumentId: "document-existing", queuedHash: "old-hash" },
      created_at: "2026-07-21T00:00:00.000Z",
    }]);
    mocks.createAdminSupabaseClient.mockResolvedValue(store.client);
    await enqueuePaymentClaimXeroSync({ claimId: "claim-1" });
    expect(store.jobs).toHaveLength(2);
    expect(store.jobs[1]).toMatchObject({ trigger_source: "user_retry", queue_state: "pending" });
  });

  it.each([
    ["Draft claim", "claim_not_submitted"],
    ["missing Contact", "client_contact_missing"],
    ["missing Sales mapping", "sales_mapping_missing"],
    ["required Retention mapping", "retention_mapping_missing"],
  ])("does not enqueue a %s", async (_label, code) => {
    mocks.evaluatePaymentClaimXeroReadinessSnapshot.mockReturnValue({
      ready: false,
      blockers: [{ code, message: `Blocked: ${code}` }],
    });
    await expect(enqueuePaymentClaimXeroSync({ claimId: "claim-1" })).rejects.toMatchObject({ code: "not_ready" });
    expect(store.documents).toHaveLength(0);
    expect(store.jobs).toHaveLength(0);
  });

  it("allows zero retention when canonical readiness does not require route 700", async () => {
    await enqueuePaymentClaimXeroSync({ claimId: "claim-1" });
    expect(store.jobs).toHaveLength(1);
  });

  it("rejects an unauthorized user before resolution or writes", async () => {
    mocks.hasOrganizationPermission.mockResolvedValue(false);
    await expect(enqueuePaymentClaimXeroSync({ claimId: "claim-1" })).rejects.toMatchObject({ code: "unauthorized" });
    expect(mocks.resolvePaymentClaimXeroReadinessContext).not.toHaveBeenCalled();
    expect(store.jobs).toHaveLength(0);
  });
});
