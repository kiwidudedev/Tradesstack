import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const service = readFileSync(
  join(process.cwd(), "lib/supplier-invoice-allocation-service.ts"),
  "utf8"
);

describe("supplier invoice actual-cost commercial guard", () => {
  it("requires a current commercial approval before new posting", () => {
    expect(service).toContain(
      "getSupplierInvoiceCommercialComparison"
    );
    expect(service).toContain(
      "Commercial approval is required before posting supplier invoice actual costs."
    );
    expect(service).toContain(
      "commercialComparison.activeApproval.finance_version_hash"
    );
  });

  it("keeps actual-cost posting secondary to final Accounts approval", () => {
    expect(service).toContain("supplier_invoice_accounts_approvals");
    expect(service).toContain(
      "Final Accounts approval is required before posting supplier invoice actual costs."
    );
  });
});
