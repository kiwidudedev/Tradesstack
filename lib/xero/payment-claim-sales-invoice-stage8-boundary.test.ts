import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const REFRESH = "lib/xero/payment-claim-sales-invoice-refresh.ts";
const ACTIONS = "app/app/(workspace)/projects/[projectId]/preconstruction/claims/[claimId]/actions.ts";
const PANEL = "components/app/PaymentClaimXeroPanel.tsx";

describe("Payment Claim Xero Stage 8 boundary", () => {
  it("keeps all refresh identifiers server-side", async () => {
    const actions = await readFile(ACTIONS, "utf8");
    expect(actions).toContain("claimId: string");
    expect(actions).toContain('intent: "refresh"');
    for (const forbidden of ["InvoiceID", "ContactID", "tenantId", "connectionId", "amountPaid", "amountDue"]) {
      expect(actions).not.toContain(forbidden);
    }
  });

  it("limits the later approved claim projection to the atomic status/paid-amount RPC", async () => {
    const source = await readFile(REFRESH, "utf8");
    expect(source).toContain('.from("project_claims")');
    expect(source).not.toMatch(/\.from\("project_claims"\)[\s\S]{0,300}\.update\(/);
    expect(source).toContain('rpc("apply_xero_sales_invoice_payment_to_claim"');
    expect(source).not.toContain("retention_");
    expect(source).not.toContain("save_project_claim");
    for (const forbidden of ["claim_title:", "claim_amount:", "gst_amount:", "total_payable:", "due_date:"]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("still adds no payment-detail, email, credit-note, or webhook architecture", async () => {
    const source = `${await readFile(REFRESH, "utf8")}\n${await readFile(PANEL, "utf8")}`.toLowerCase();
    expect(source).not.toContain("payment_details");
    expect(source).not.toContain("paymentid");
    expect(source).not.toContain("sendemail");
    expect(source).not.toContain("credit note");
    expect(source).not.toContain("webhook");
  });
});
