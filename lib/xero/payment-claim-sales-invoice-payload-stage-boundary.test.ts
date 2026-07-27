import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const PAYLOAD_SERVICE = "lib/xero/payment-claim-sales-invoice-payload.ts";

describe("Payment Claim Xero payload Stage 4 boundary", () => {
  it("reuses the Stage 3 resolver and performs no persistence or external work", async () => {
    const source = await readFile(PAYLOAD_SERVICE, "utf8");
    const lower = source.toLowerCase();
    expect(source).toContain("resolvePaymentClaimXeroReadinessContext");
    expect(source).toContain("resolvePaymentClaimXeroDependencies");
    expect(lower).not.toContain("createadminsupabaseclient");
    expect(lower).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
    expect(lower).not.toContain("createxeroinvoices");
    expect(lower).not.toContain("updatexeroinvoices");
    expect(lower).not.toContain("enqueue");
    expect(lower).not.toContain("idempotency");
    expect(lower).not.toContain("createhash");
    expect(lower).not.toContain("last_synced_hash");
    expect(lower).not.toContain("attachment");
    expect(lower).not.toContain("poll");
  });

  it("accepts no browser-supplied accounting or invoice values", async () => {
    const source = await readFile(PAYLOAD_SERVICE, "utf8");
    expect(source).toContain("organizationId: string");
    expect(source).toContain("claimId: string");
    expect(source).not.toMatch(/ContactID:\s*params\./);
    expect(source).not.toMatch(/AccountCode:\s*params\./);
    expect(source).not.toMatch(/TaxType:\s*params\./);
    expect(source).not.toMatch(/InvoiceNumber:\s*params\./);
    expect(source).not.toMatch(/UnitAmount:\s*params\./);
    expect(source).not.toMatch(/Date:\s*params\./);
    expect(source).not.toMatch(/DueDate:\s*params\./);
  });
});
