import { describe, expect, it } from "vitest";
import { getPaymentClaimStatutoryDocuments } from "@/lib/legal/payment-claim-statutory-documents";

describe("payment claim statutory documents", () => {
  it("resolves Form 1 exactly once for New Zealand", () => {
    const documents = getPaymentClaimStatutoryDocuments({ organisationCountry: "New Zealand" });
    expect(documents).toHaveLength(1);
    expect(documents[0]?.jurisdiction).toBe("NZ");
  });

  it("resolves no documents for non New Zealand countries", () => {
    expect(getPaymentClaimStatutoryDocuments({ organisationCountry: "Australia" })).toEqual([]);
    expect(getPaymentClaimStatutoryDocuments({ organisationCountry: "AU" })).toEqual([]);
    expect(getPaymentClaimStatutoryDocuments({ organisationCountry: "Unknown" })).toEqual([]);
    expect(getPaymentClaimStatutoryDocuments({ organisationCountry: "" })).toEqual([]);
    expect(getPaymentClaimStatutoryDocuments({ organisationCountry: null })).toEqual([]);
  });
});
