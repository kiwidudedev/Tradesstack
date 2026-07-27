import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const SERVICE = "lib/xero/payment-claim-sales-invoice-attachment.ts";
const ACTIONS = "app/app/(workspace)/projects/[projectId]/preconstruction/claims/[claimId]/actions.ts";
const PDF_SERVER = "lib/exports/payment-claim-pdf-server.ts";

describe("Payment Claim Xero Stage 9 boundary", () => {
  it("accepts only claim ID and attachment intent from the browser", async () => {
    const actions = await readFile(ACTIONS, "utf8");
    expect(actions).toContain('intent: "attach" | "retry_attachment"');
    for (const forbidden of ["InvoiceID", "tenantId", "connectionId", "filename:", "pdfBytes", "claimTotals", "syncedHash:"]) {
      expect(actions).not.toContain(forbidden);
    }
  });

  it("never creates or financially updates an invoice or Payment Claim", async () => {
    const source = await readFile(SERVICE, "utf8");
    expect(source).not.toContain("createXeroInvoices");
    expect(source).not.toContain("updateXeroSalesInvoice");
    expect(source).not.toMatch(/\.from\("project_claims"\)[\s\S]{0,300}\.update\(/);
    for (const field of ["claim_amount:", "retention_withheld_amount:", "gst_amount:", "paid_amount:", "status: \"Paid\""]) {
      expect(source).not.toContain(field);
    }
  });

  it("reuses the normal PDF composer and adds no later-stage architecture", async () => {
    const source = `${await readFile(SERVICE, "utf8")}\n${await readFile(PDF_SERVER, "utf8")}`.toLowerCase();
    expect(source).toContain("composepaymentclaimpdfexport");
    for (const forbidden of ["sendemail", "credit note", "replacement invoice", "supplementary invoice", "webhook", "payment_details", "paymentid"]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
