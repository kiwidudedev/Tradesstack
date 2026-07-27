import { afterEach, describe, expect, it, vi } from "vitest";
import { putXeroInvoiceAttachment } from "./client";

describe("Xero invoice attachment client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses PUT so the same deterministic filename replaces rather than duplicates", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
      Attachments: [{
        AttachmentID: "attachment-1",
        FileName: "Payment-Claim-PC-0042.pdf",
        Url: "https://api.xero.com/api.xro/2.0/Invoices/invoice-1/Attachments/Payment-Claim-PC-0042.pdf",
      }],
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const bytes = new TextEncoder().encode("%PDF-1.4");
    const result = await putXeroInvoiceAttachment({
      accessToken: "access-token", tenantId: "tenant-1", invoiceId: "invoice-1",
      fileName: "Payment-Claim-PC-0042.pdf", bytes, includeOnline: true,
    });
    expect(result[0]?.FileName).toBe("Payment-Claim-PC-0042.pdf");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/Invoices/invoice-1/Attachments/Payment-Claim-PC-0042.pdf?IncludeOnline=true");
    expect(init).toMatchObject({ method: "PUT", headers: expect.objectContaining({ "Content-Type": "application/pdf" }) });
    expect(init?.body).toEqual(bytes);
  });
});
