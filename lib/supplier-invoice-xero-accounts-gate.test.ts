import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const bills = readFileSync("lib/xero/bills.ts", "utf8");
const actions = readFileSync(
  "app/app/(workspace)/company/supplier-invoices/[invoiceId]/actions.ts",
  "utf8",
);

describe("Supplier Invoice final Accounts approval Xero gate", () => {
  it("requires a current finance-hash-bound Accounts approval for normal export readiness", () => {
    expect(bills).toContain("supplier_invoice_accounts_approvals");
    expect(bills).toContain('"missing_accounts_approval"');
    expect(bills).toContain("accountsApproval.finance_hash !== comparison.financeVersionHash");
  });

  it("allows only the final Accounts action to evaluate pre-approval Xero readiness", () => {
    expect(actions).toContain("requireAccountsApproval: false");
    expect(actions).toContain("record_supplier_invoice_accounts_approval");
    expect(actions).toContain('"supplier_invoices.accounts_approve"');
  });
});
