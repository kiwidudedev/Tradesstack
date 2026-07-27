import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const CREATE_SERVICE = "lib/xero/payment-claim-sales-invoice-create.ts";
const WORKER = "lib/xero/sync.ts";

describe("Payment Claim Xero create Stage 5 boundary", () => {
  it("contains initial create and one retrieval, but no Xero update path", async () => {
    const source = await readFile(CREATE_SERVICE, "utf8");
    expect(source).toContain("createXeroInvoices");
    expect(source).toContain("getXeroInvoice");
    expect(source).toContain("findXeroInvoicesByNumber");
    expect(source).not.toContain("updateXeroInvoice");
    expect(source).not.toMatch(/InvoiceID:\s/);
  });

  it("does not introduce payment, hash, UI, polling, attachment, or amendment behaviour", async () => {
    const source = (await readFile(CREATE_SERVICE, "utf8")).toLowerCase();
    expect(source).not.toContain("amount_paid");
    expect(source).not.toContain("amount_due");
    expect(source).not.toContain("last_synced_hash");
    expect(source).not.toContain("payment_projection");
    expect(source).not.toContain("attachment");
    expect(source).not.toContain("poll");
    expect(source).not.toContain("amendment");
    expect(source).not.toContain("revalidatepath");
  });

  it("keeps create routed through the existing sync job", async () => {
    const worker = await readFile(WORKER, "utf8");
    expect(worker).toContain('job.job_kind === "xero.sales_invoice.sync"');
    expect(worker).toContain("createInitialXeroSalesInvoice");
    expect(worker).toContain('job.job_kind === "xero.sales_invoice.sync"');
  });
});
