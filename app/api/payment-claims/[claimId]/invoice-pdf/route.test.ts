import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentOrganizationMember: vi.fn(),
  getCurrentOrganizationMemberWithTiming: vi.fn(),
  generateInvoicePdfBundleServer: vi.fn(),
}));
vi.mock("@/lib/projects-server", () => ({
  getCurrentOrganizationMember: mocks.getCurrentOrganizationMember,
  getCurrentOrganizationMemberWithTiming:
    mocks.getCurrentOrganizationMemberWithTiming,
}));
vi.mock("@/lib/exports/invoice-pdf-server", async () => {
  class InvoicePdfServerError extends Error {
    constructor(
      readonly code: string,
      message: string,
    ) {
      super(message);
    }
  }
  return {
    generateInvoicePdfBundleServer: mocks.generateInvoicePdfBundleServer,
    InvoicePdfServerError,
  };
});

import { GET } from "./route";

function request(claimId = "claim-1") {
  return GET(
    new Request(
      `http://localhost/api/payment-claims/${claimId}/invoice-pdf`,
    ),
    { params: Promise.resolve({ claimId }) },
  );
}

describe("Payment Claim invoice PDF route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.PDF_EXPORT_TIMING;
    vi.restoreAllMocks();
  });

  it("rejects unauthenticated access before loading invoice data", async () => {
    mocks.getCurrentOrganizationMember.mockResolvedValue(null);
    const response = await request();
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "unauthorized",
    });
    expect(mocks.generateInvoicePdfBundleServer).not.toHaveBeenCalled();
  });

  it("passes only the authenticated organization and URL claim identity to the server builder", async () => {
    mocks.getCurrentOrganizationMember.mockResolvedValue({
      organization_id: "org-1",
      user_id: "user-1",
    });
    const bytes = new TextEncoder().encode("%PDF-invoice");
    mocks.generateInvoicePdfBundleServer.mockResolvedValue({
      bytes,
      fileName: 'Invoice-PC-0042-R1".pdf',
    });
    const response = await request("claim-1");

    expect(mocks.generateInvoicePdfBundleServer).toHaveBeenCalledWith({
      organizationId: "org-1",
      claimId: "claim-1",
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="Invoice-PC-0042-R1 .pdf"',
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-length")).toBe(
      String(bytes.byteLength),
    );
  });

  it("does not accept an organization or commercial values from request input", async () => {
    mocks.getCurrentOrganizationMember.mockResolvedValue({
      organization_id: "trusted-org",
      user_id: "user-1",
    });
    mocks.generateInvoicePdfBundleServer.mockResolvedValue({
      bytes: new TextEncoder().encode("%PDF"),
      fileName: "Invoice-PC-1.pdf",
    });
    const response = await GET(
      new Request(
        "http://localhost/api/payment-claims/claim-1/invoice-pdf"
        + "?organizationId=attacker-org&total=1",
      ),
      { params: Promise.resolve({ claimId: "claim-1" }) },
    );
    expect(response.status).toBe(200);
    expect(mocks.generateInvoicePdfBundleServer).toHaveBeenCalledWith({
      organizationId: "trusted-org",
      claimId: "claim-1",
    });
  });

  it("emits correlation-safe Server-Timing only when explicitly enabled", async () => {
    process.env.PDF_EXPORT_TIMING = "1";
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    mocks.getCurrentOrganizationMemberWithTiming.mockImplementation(
      async (mark: (stage: string) => void) => {
        mark("authentication-completed");
        mark("membership-completed");
        return {
          organization_id: "org-timed",
          user_id: "user-timed",
        };
      },
    );
    mocks.generateInvoicePdfBundleServer.mockResolvedValue({
      bytes: new TextEncoder().encode("%PDF"),
      fileName: "Invoice-PC-1.pdf",
    });

    const response = await GET(
      new Request(
        "http://localhost/api/payment-claims/claim-1/invoice-pdf",
        { headers: { "X-Pdf-Export-Id": "export-correlation-1" } },
      ),
      { params: Promise.resolve({ claimId: "claim-1" }) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-pdf-export-id")).toBe(
      "export-correlation-1",
    );
    expect(response.headers.get("server-timing")).toContain("authentication");
    expect(mocks.generateInvoicePdfBundleServer).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-timed",
        claimId: "claim-1",
        timing: expect.objectContaining({
          enabled: true,
          exportId: "export-correlation-1",
        }),
      }),
    );
  });

  it("returns a generic not-found response for an organization-scoped miss", async () => {
    mocks.getCurrentOrganizationMember.mockResolvedValue({
      organization_id: "org-2",
      user_id: "user-2",
    });
    const { InvoicePdfServerError } = await import(
      "@/lib/exports/invoice-pdf-server"
    );
    mocks.generateInvoicePdfBundleServer.mockRejectedValue(
      new InvoicePdfServerError(
        "not_found",
        "The requested invoice source could not be found.",
      ),
    );
    const response = await request("claim-from-org-1");
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "not_found",
      message: "The requested invoice source could not be found.",
    });
  });

  it("returns a clear conflict for Draft and Cancelled claims", async () => {
    mocks.getCurrentOrganizationMember.mockResolvedValue({
      organization_id: "org-1",
      user_id: "user-1",
    });
    const { InvoicePdfServerError } = await import(
      "@/lib/exports/invoice-pdf-server"
    );
    mocks.generateInvoicePdfBundleServer.mockRejectedValue(
      new InvoicePdfServerError(
        "ineligible_status",
        "Invoices can only be exported for Submitted, Unpaid, Paid, or Overdue claims.",
      ),
    );
    const response = await request();
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "ineligible_status",
    });
  });

  it("keeps the route and server model free of mutation and Xero execution imports", () => {
    const routeSource = readFileSync(
      "app/api/payment-claims/[claimId]/invoice-pdf/route.ts",
      "utf8",
    );
    const serverSource = readFileSync(
      "lib/exports/invoice-pdf-server.ts",
      "utf8",
    );
    const combined = `${routeSource}\n${serverSource}`;
    [
      ".insert(",
      ".update(",
      ".delete(",
      ".rpc(",
      "enqueuePaymentClaim",
      "confirmPaymentClaim",
      "runXeroSyncWorker",
      "putXeroInvoice",
      "getPaymentClaimStatutoryDocuments",
      "composePaymentClaimPdfExport",
    ].forEach((forbidden) => expect(combined).not.toContain(forbidden));
  });
});
