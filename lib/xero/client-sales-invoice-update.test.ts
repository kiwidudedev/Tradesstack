import { afterEach, describe, expect, it, vi } from "vitest";

import { updateXeroSalesInvoice } from "./client";

describe("narrow Xero Sales Invoice update client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("posts the authoritative payload to the exact encoded InvoiceID with its idempotency key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      Invoices: [{ InvoiceID: "invoice/1", Type: "ACCREC", InvoiceNumber: "PC-1" }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await updateXeroSalesInvoice({
      accessToken: "access-token",
      tenantId: "tenant-1",
      invoiceId: "invoice/1",
      invoice: {
        Type: "ACCREC",
        InvoiceNumber: "PC-1",
        Contact: { ContactID: "contact-1" },
        LineItems: [{ Description: "Revenue", UnitAmount: 100, AccountCode: "200", TaxType: "OUTPUT" }],
      },
      idempotencyKey: "update-key",
    });

    const [url, request] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/api.xro/2.0/Invoices/invoice%2F1");
    expect(request.method).toBe("POST");
    expect(request.headers).toMatchObject({
      "xero-tenant-id": "tenant-1",
      "Idempotency-Key": "update-key",
    });
    expect(JSON.parse(String(request.body))).toMatchObject({
      Invoices: [{ InvoiceID: "invoice/1", Type: "ACCREC", InvoiceNumber: "PC-1" }],
    });
  });

  it("refuses a blank target before making a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(updateXeroSalesInvoice({
      accessToken: "access-token",
      tenantId: "tenant-1",
      invoiceId: " ",
      invoice: { Type: "ACCREC" },
      idempotencyKey: "update-key",
    })).rejects.toThrow("InvoiceID is required");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
