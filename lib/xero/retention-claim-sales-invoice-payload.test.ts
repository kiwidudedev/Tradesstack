import { describe, expect, it } from "vitest";
import {
  buildRetentionClaimXeroPayload,
  RetentionClaimXeroPayloadError,
} from "@/lib/xero/retention-claim-sales-invoice-payload";

function source() {
  return {
    schemaVersion: 1 as const,
    claim: {
      id: "11111111-1111-4111-8111-111111111111",
      organizationId: "22222222-2222-4222-8222-222222222222",
      projectId: "33333333-3333-4333-8333-333333333333",
      claimNumber: "RC-0007",
      title: "Final retention",
      reference: null,
      issueDate: "2026-07-24",
      dueDate: "2026-08-20",
      status: "submitted" as const,
      subtotalExclTax: "150.03",
      submissionStateHash: "a".repeat(64),
      submittedAt: "2026-07-24T00:00:00Z",
    },
    allocations: [
      {
        id: "44444444-4444-4444-8444-444444444444",
        allocationSequence: 2,
        originatingPaymentClaimId: "55555555-5555-4555-8555-555555555555",
        allocationAmount: "50.02",
        originClaimNumberSnapshot: "PC-002",
      },
      {
        id: "66666666-6666-4666-8666-666666666666",
        allocationSequence: 1,
        originatingPaymentClaimId: "77777777-7777-4777-8777-777777777777",
        allocationAmount: "100.01",
        originClaimNumberSnapshot: "PC-001",
      },
    ],
  };
}

describe("Retention Claim Xero sales invoice payload", () => {
  it("creates one positive route-700 line per immutable originating allocation", () => {
    const result = buildRetentionClaimXeroPayload({
      source: source(),
      projectName: "Harbour Apartments",
      contactId: "contact-id",
      accountCode: "700",
      taxType: "OUTPUT2",
      taxRateBasisPoints: 1500,
    });

    expect(result.payload).toMatchObject({
      Type: "ACCREC",
      Status: "AUTHORISED",
      CurrencyCode: "NZD",
      LineAmountTypes: "Exclusive",
      InvoiceNumber: "RC-0007",
      Contact: { ContactID: "contact-id" },
    });
    expect(result.payload.LineItems).toEqual([
      {
        Description: "Retention release - Payment Claim PC-001",
        Quantity: 1,
        UnitAmount: 100.01,
        AccountCode: "700",
        TaxType: "OUTPUT2",
      },
      {
        Description: "Retention release - Payment Claim PC-002",
        Quantity: 1,
        UnitAmount: 50.02,
        AccountCode: "700",
        TaxType: "OUTPUT2",
      },
    ]);
    expect(result.lines.map((line) => line.originatingPaymentClaimId)).toEqual([
      "77777777-7777-4777-8777-777777777777",
      "55555555-5555-4555-8555-555555555555",
    ]);
    expect(result).toMatchObject({
      subtotalExclTax: 150.03,
      taxTotal: 22.5,
      total: 172.53,
    });
    expect(result.payloadSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.idempotencyKey).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(result.payload)).not.toContain("600");
    expect(JSON.stringify(result.payload)).not.toContain("revenue");
  });

  it("uses deterministic per-line half-up GST rounding", () => {
    const value = source();
    value.claim.subtotalExclTax = "0.10";
    value.allocations = value.allocations.slice(0, 2).map((allocation, index) => ({
      ...allocation,
      allocationAmount: "0.05",
      allocationSequence: index + 1,
    }));
    const result = buildRetentionClaimXeroPayload({
      source: value,
      projectName: "Project",
      contactId: "contact",
      accountCode: "700",
      taxType: "OUTPUT2",
      taxRateBasisPoints: 1500,
    });
    expect(result.taxTotal).toBe(0.02);
    expect(result.total).toBe(0.12);
  });

  it("rejects any allocation total that differs from submitted evidence", () => {
    const value = source();
    value.claim.subtotalExclTax = "150.04";
    expect(() => buildRetentionClaimXeroPayload({
      source: value,
      projectName: "Project",
      contactId: "contact",
      accountCode: "700",
      taxType: "OUTPUT2",
      taxRateBasisPoints: 1500,
    })).toThrowError(RetentionClaimXeroPayloadError);
  });

  it("accepts configured non-NZ tax and rejects fractions below one cent", () => {
    expect(buildRetentionClaimXeroPayload({
      source: source(),
      projectName: "Project",
      contactId: "contact",
      accountCode: "700",
      taxType: "OUTPUT",
      taxRateBasisPoints: 1000,
      currencyCode: "AUD",
    }).payload).toMatchObject({
      CurrencyCode: "AUD",
      LineItems: [{ TaxType: "OUTPUT" }, { TaxType: "OUTPUT" }],
    });
    const value = source();
    value.allocations[0]!.allocationAmount = "50.021";
    expect(() => buildRetentionClaimXeroPayload({
      source: value,
      projectName: "Project",
      contactId: "contact",
      accountCode: "700",
      taxType: "OUTPUT2",
      taxRateBasisPoints: 1500,
    })).toThrow(/fractions smaller than one cent/);
  });
});
