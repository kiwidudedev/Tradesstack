import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const SERVICE = "lib/xero/payment-claim-readiness.ts";

describe("Payment Claim Xero readiness Stage 3 boundary", () => {
  it("is read-only and contains no Stage 4 or later functionality", async () => {
    const source = (await readFile(SERVICE, "utf8")).toLowerCase();
    expect(source).toContain("ready:");
    expect(source).toContain("blockers:");
    expect(source).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
    expect(source).not.toContain("createxeroinvoice");
    expect(source).not.toContain("updatexeroinvoice");
    expect(source).not.toContain("enqueue");
    expect(source).not.toContain("idempotency");
    expect(source).not.toContain("createhash");
    expect(source).not.toContain("lineitems");
    expect(source).not.toContain("attachment");
    expect(source).not.toContain("poll");
  });

  it("accepts only server-resolved organization and claim identities", async () => {
    const source = await readFile(SERVICE, "utf8");
    expect(source).toContain("organizationId: string");
    expect(source).toContain("claimId: string");
    expect(source).not.toMatch(/tenantId:\s*string[;,]/);
    expect(source).not.toMatch(/connectionId:\s*string[;,]/);
    expect(source).not.toMatch(/contactId:\s*string[;,]/);
    expect(source).not.toMatch(/invoiceId:\s*string[;,]/);
  });
});
