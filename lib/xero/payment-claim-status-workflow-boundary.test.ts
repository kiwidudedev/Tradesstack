import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const registerPage = fs.readFileSync(
  path.join(process.cwd(), "app/app/(workspace)/projects/[projectId]/preconstruction/claims/PaymentClaimsRegisterClient.tsx"),
  "utf8",
);
const detailPage = fs.readFileSync(
  path.join(process.cwd(), "app/app/(workspace)/projects/[projectId]/preconstruction/claims/[claimId]/PaymentClaimDetailClient.tsx"),
  "utf8",
);
const refreshService = fs.readFileSync(
  path.join(process.cwd(), "lib/xero/payment-claim-sales-invoice-refresh.ts"),
  "utf8",
);

describe("existing Payment Claim status workflow boundary", () => {
  it("keeps all six existing manual statuses and adds no Partially Paid claim status", () => {
    for (const status of ["Draft", "Submitted", "Unpaid", "Paid", "Overdue", "Cancelled"]) {
      expect(registerPage).toContain(`"${status}"`);
      expect(detailPage).toContain(`value="${status}"`);
    }
    expect(registerPage).not.toContain('"Partially Paid"');
    expect(detailPage).not.toContain('value="Partially Paid"');
  });

  it("keeps the dropdown on the existing status RPC and does not call Xero", () => {
    const dropdownAction = registerPage.slice(
      registerPage.indexOf("const updateClaimStatus"),
      registerPage.indexOf("return (", registerPage.indexOf("const updateClaimStatus")),
    );
    expect(dropdownAction).toContain('rpc("update_project_claim_status"');
    expect(dropdownAction).not.toContain("Xero");
    expect(dropdownAction).not.toContain("enqueuePaymentClaimXeroRefresh");
    expect(dropdownAction).not.toContain("getXeroInvoice");
  });

  it("preserves manual save fields and the existing Xero panel without a duplicate authority message", () => {
    expect(detailPage).toContain("p_status: status");
    expect(detailPage).toContain("p_paid_amount:");
    expect(detailPage).toContain("<PaymentClaimXeroPanel");
    expect(detailPage).not.toContain("Payment status is synchronized from Xero for linked claims.");
    expect(detailPage).not.toContain("Retention Claim");
  });

  it("uses the same refresh apply service for manual and scheduled jobs and includes Paid for reversals", () => {
    expect(refreshService).toContain('triggerSource: "manual_refresh" | "scheduled"');
    expect(refreshService).toContain("refreshXeroSalesInvoiceStatus");
    expect(refreshService).toContain("partially_paid,paid,unknown");
    expect(refreshService).not.toContain("Partially Paid");
    expect(refreshService).not.toContain("bill-refresh");
  });
});
