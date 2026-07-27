import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const createAdminSupabaseClient = vi.fn();
const getFreshXeroAccessToken = vi.fn();
const getOrganizationXeroConnection = vi.fn();
const getXeroInvoice = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabaseClient }));
vi.mock("@/lib/xero/service", () => ({ getFreshXeroAccessToken, getOrganizationXeroConnection }));
vi.mock("@/lib/xero/client", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/xero/client")>();
  return { ...original, getXeroInvoice };
});

const document = {
  id: "document-1",
  organization_id: "organization-1",
  accounting_connection_id: "connection-1",
  current_version_id: "version-1",
  provider: "xero",
  tenant_id: "tenant-1",
  local_document_id: "invoice-1",
  external_document_id: "xero-invoice-1",
  external_document_number: "SUP-1",
  export_status: "exported",
  amount_exported: 805,
  normalized_external_status: "draft",
  provider_updated_at: null,
};

function documentBuilder() {
  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: async () => ({ data: document, error: null }),
  };
  return builder;
}

describe("Xero Bill status refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getFreshXeroAccessToken.mockResolvedValue({
      connection: { id: "connection-1", tenant_id: "tenant-1" },
      tokenSet: { access_token: "access-token" },
    });
    getOrganizationXeroConnection.mockResolvedValue({
      id: "connection-1",
      tenant_id: "tenant-1",
      status: "connected",
    });
  });

  it("persists a paid provider response through the atomic RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { changed: true, stale: false }, error: null });
    createAdminSupabaseClient.mockResolvedValue({ from: () => documentBuilder(), rpc });
    getXeroInvoice.mockResolvedValue([{
      InvoiceID: "xero-invoice-1",
      Type: "ACCPAY",
      Status: "PAID",
      Total: 805,
      AmountPaid: 805,
      AmountDue: 0,
      AmountCredited: 0,
      FullyPaidOnDate: "2026-07-18",
      UpdatedDateUTC: "2026-07-18T01:00:00Z",
    }]);

    const { refreshXeroBillStatus } = await import("./bill-refresh");
    const result = await refreshXeroBillStatus({
      organizationId: "organization-1",
      documentId: "document-1",
      workerJobId: "job-1",
    });

    expect(result).toMatchObject({
      rawStatus: "PAID",
      normalizedStatus: "paid",
      amountPaid: 805,
      amountDue: 0,
      changed: true,
    });
    expect(rpc).toHaveBeenCalledWith("apply_xero_bill_status_refresh", expect.objectContaining({
      p_expected_external_document_id: "xero-invoice-1",
      p_expected_tenant_id: "tenant-1",
      p_job_id: "job-1",
      p_normalized_external_status: "paid",
    }));
  });

  it("rejects a provider identity mismatch without persisting state", async () => {
    const rpc = vi.fn();
    createAdminSupabaseClient.mockResolvedValue({ from: () => documentBuilder(), rpc });
    getXeroInvoice.mockResolvedValue([{ InvoiceID: "wrong", Type: "ACCPAY", Status: "PAID" }]);

    const { refreshXeroBillStatus } = await import("./bill-refresh");
    await expect(refreshXeroBillStatus({
      organizationId: "organization-1",
      documentId: "document-1",
      workerJobId: "job-1",
    })).rejects.toThrow("invalid Bill identity");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("deduplicates active refresh jobs by internal accounting document", async () => {
    const jobs: Array<Record<string, unknown>> = [];
    const admin = {
      rpc: vi.fn(),
      from(table: string) {
        if (table === "organization_accounting_documents") return documentBuilder();
        const jobBuilder = {
          select() { return jobBuilder; },
          eq() { return jobBuilder; },
          in() { return jobBuilder; },
          order: async () => ({ data: jobs, error: null }),
          insert(value: Record<string, unknown>) {
            const row = { id: "job-1", queue_state: "pending", ...value };
            jobs.push(row);
            return { select: () => ({ single: async () => ({ data: row, error: null }) }) };
          },
        };
        return jobBuilder;
      },
    };
    createAdminSupabaseClient.mockResolvedValue(admin);

    const { enqueueXeroBillRefresh } = await import("./bill-refresh");
    const first = await enqueueXeroBillRefresh({
      organizationId: "organization-1",
      documentId: "document-1",
      createdByUserId: "user-1",
      triggerSource: "manual_refresh",
    });
    const second = await enqueueXeroBillRefresh({
      organizationId: "organization-1",
      documentId: "document-1",
      createdByUserId: "user-1",
      triggerSource: "manual_refresh",
    });

    expect(first.created).toBe(true);
    expect(second).toMatchObject({ jobId: "job-1", created: false });
    expect(jobs).toHaveLength(1);
  });
});
