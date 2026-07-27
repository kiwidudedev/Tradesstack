import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const UPDATE_SERVICE = "lib/xero/payment-claim-sales-invoice-update.ts";
const CLIENT = "lib/xero/client.ts";
const WORKER = "lib/xero/sync.ts";

describe("Payment Claim Xero update Stage 6 boundary", () => {
  it("uses one exact linked InvoiceID and the existing sync job", async () => {
    const [service, client, worker] = await Promise.all([
      readFile(UPDATE_SERVICE, "utf8"),
      readFile(CLIENT, "utf8"),
      readFile(WORKER, "utf8"),
    ]);
    expect(service).toContain("updateXeroSalesInvoice");
    expect(service).toContain("getXeroInvoice");
    expect(service).not.toContain("createXeroInvoices");
    expect(client).toContain("/Invoices/${encodeURIComponent(invoiceId)}");
    expect(worker).toContain('job.job_kind === "xero.sales_invoice.sync"');
    expect(worker).toContain("external_document_id");
    expect(worker).toContain("updateExistingXeroSalesInvoice");
    expect(worker).toContain("createInitialXeroSalesInvoice");
    expect(worker).toContain('job.job_kind === "xero.sales_invoice.sync"');
  });

  it("does not add Stage 7 or later functionality", async () => {
    const source = (await readFile(UPDATE_SERVICE, "utf8")).toLowerCase();
    expect(source).not.toContain("amount_paid:");
    expect(source).not.toContain("amount_due:");
    expect(source).not.toContain("fully_paid_at:");
    expect(source).not.toContain("payment_projection");
    expect(source).not.toContain("attachment");
    expect(source).not.toContain("pdf");
    expect(source).not.toContain("credit note");
    expect(source).not.toContain("email");
    expect(source).not.toContain("revalidatepath");
    expect(source).not.toContain("project_claims\").update");
    expect(source).not.toContain("insert(");
  });
});
