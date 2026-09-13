import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import {
  derivePaymentClaimAccountingIdentity,
  paymentClaimXeroInvoiceUrl,
} from "./payment-claim-accounting-identity";

const organizationId = "org-1";
const claimId = "claim-1";

function document(overrides: Record<string, unknown> = {}) {
  return {
    id: "document-1",
    organization_id: organizationId,
    project_claim_id: claimId,
    provider: "xero",
    accounting_connection_id: "connection-1",
    tenant_id: "tenant-1",
    integration_contract: "payment_claim_revision_v1",
    active_accounting_revision_id: "revision-1",
    external_document_id: "invoice-1",
    external_document_number: "PC-0042",
    export_status: "exported",
    updated_at: "2026-07-27T00:00:00.000Z",
    ...overrides,
  };
}

function revision(overrides: Record<string, unknown> = {}) {
  return {
    id: "revision-1",
    organization_id: organizationId,
    accounting_document_id: "document-1",
    source_document_id: claimId,
    provider: "xero",
    connection_id: "connection-1",
    tenant_id: "tenant-1",
    external_document_id: "invoice-1",
    external_document_number: "PC-0042",
    lifecycle_state: "succeeded",
    ...overrides,
  };
}

function resolve(overrides: {
  document?: Record<string, unknown> | null;
  revision?: Record<string, unknown> | null;
  connection?: Record<string, unknown> | null;
  jobs?: Array<Record<string, unknown>>;
} = {}) {
  return derivePaymentClaimAccountingIdentity({
    organizationId,
    claimId,
    document: overrides.document === null
      ? null
      : document(overrides.document),
    activeRevision: overrides.revision === null
      ? null
      : revision(overrides.revision),
    currentConnection: overrides.connection === null
      ? null
      : {
          id: "connection-1",
          tenant_id: "tenant-1",
          status: "connected",
          ...overrides.connection,
        },
    jobs: overrides.jobs ?? [],
  });
}

describe("Payment Claim authoritative accounting identity", () => {
  it("resolves navigation from the successful active revision regardless of workflow status", () => {
    const identity = resolve({
      document: { export_status: "queued" },
      jobs: [{
        id: "update-job",
        job_kind: "xero.payment_claim.accounting_update",
        queue_state: "pending",
      }],
    });

    expect(identity).toMatchObject({
      invoiceId: "invoice-1",
      invoiceNumber: "PC-0042",
      identitySource: "active_revision",
      identityIssue: null,
      navigationUrl:
        "https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID=invoice-1",
      refresh: {
        eligible: false,
        blockingReason: "accounting_update_in_progress",
      },
    });
    expect(identity.refresh.message).not.toMatch(/not found/i);
  });

  it.each([
    ["xero.payment_claim.initial_push", "initial_push_in_progress"],
    ["xero.payment_claim.replacement", "replacement_in_progress"],
    ["xero.payment_claim.accounting_update", "accounting_update_in_progress"],
    ["xero.sales_invoice.sync", "sync_in_progress"],
    ["xero.sales_invoice.refresh", "refresh_in_progress"],
  ] as const)("separates active %s workflow from invoice existence", (jobKind, reason) => {
    const identity = resolve({
      jobs: [{ id: "job-1", job_kind: jobKind, queue_state: "claimed" }],
    });
    expect(identity.invoiceId).toBe("invoice-1");
    expect(identity.refresh).toMatchObject({
      eligible: false,
      blockingReason: reason,
    });
  });

  it("reports a genuinely missing InvoiceID separately", () => {
    const identity = resolve({
      document: { external_document_id: null },
      revision: { external_document_id: null },
    });
    expect(identity.identityIssue).toBe("missing_invoice_id");
    expect(identity.invoiceId).toBeNull();
    expect(identity.navigationUrl).toBeNull();
  });

  it("rejects a missing or mismatched active revision", () => {
    expect(resolve({ revision: null }).identityIssue).toBe(
      "missing_active_revision",
    );
    expect(resolve({
      revision: { lifecycle_state: "failed" },
    }).identityIssue).toBe("revision_mismatch");
  });

  it("separates InvoiceID and Invoice Number mismatches", () => {
    expect(resolve({
      revision: { external_document_id: "invoice-other" },
    }).identityIssue).toBe("invoice_id_mismatch");
    expect(resolve({
      revision: { external_document_number: "PC-OTHER" },
    }).identityIssue).toBe("invoice_number_mismatch");
  });

  it("separates connection and tenant mismatch from invoice existence", () => {
    const connectionMismatch = resolve({
      connection: { id: "connection-other" },
    });
    expect(connectionMismatch.invoiceId).toBe("invoice-1");
    expect(connectionMismatch.refresh.blockingReason).toBe(
      "connection_mismatch",
    );

    const tenantMismatch = resolve({
      connection: { tenant_id: "tenant-other" },
    });
    expect(tenantMismatch.invoiceId).toBe("invoice-1");
    expect(tenantMismatch.refresh.blockingReason).toBe("tenant_mismatch");
  });

  it("preserves exact URL encoding", () => {
    expect(paymentClaimXeroInvoiceUrl("invoice/id value")).toBe(
      "https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID=invoice%2Fid%20value",
    );
  });
});
