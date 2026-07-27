import { describe, expect, it } from "vitest";
import { resolveAccountingIdentityPresentation } from "./accounting-identity-presentation";

describe("accounting identity presentation", () => {
  it("falls back to the permanent commercial number when unexported", () => {
    expect(resolveAccountingIdentityPresentation({
      commercialClaimNumber: "26028-PC-03",
    })).toEqual({
      commercialClaimNumber: "26028-PC-03",
      activeXeroInvoiceNumber: null,
      activeXeroInvoiceId: null,
      displayAccountingNumber: "26028-PC-03",
      hasReplacementIdentity: false,
    });
  });

  it("keeps matching initial claim and Xero identities distinct", () => {
    expect(resolveAccountingIdentityPresentation({
      commercialClaimNumber: "26028-PC-03",
      activeRevisionInvoiceNumber: "26028-PC-03",
      activeRevisionInvoiceId: "invoice-1",
    })).toMatchObject({
      commercialClaimNumber: "26028-PC-03",
      activeXeroInvoiceNumber: "26028-PC-03",
      displayAccountingNumber: "26028-PC-03",
      hasReplacementIdentity: false,
    });
  });

  it("presents the exact active Payment Claim replacement", () => {
    expect(resolveAccountingIdentityPresentation({
      commercialClaimNumber: "26028-CL-02",
      activeRevisionInvoiceNumber: "26028-CL-02-R1",
      activeRevisionInvoiceId: "invoice-r1",
    })).toMatchObject({
      commercialClaimNumber: "26028-CL-02",
      activeXeroInvoiceNumber: "26028-CL-02-R1",
      displayAccountingNumber: "26028-CL-02-R1",
      hasReplacementIdentity: true,
    });
  });

  it("presents the exact active Retention replacement without deriving a suffix", () => {
    expect(resolveAccountingIdentityPresentation({
      commercialClaimNumber: "26028-RC-01",
      activeRevisionInvoiceNumber: "26028-RC-01-R2",
      activeRevisionInvoiceId: "invoice-r2",
    })).toMatchObject({
      commercialClaimNumber: "26028-RC-01",
      activeXeroInvoiceNumber: "26028-RC-01-R2",
      displayAccountingNumber: "26028-RC-01-R2",
      hasReplacementIdentity: true,
    });
  });

  it("prefers the active revision over stale document and historical identities", () => {
    expect(resolveAccountingIdentityPresentation({
      commercialClaimNumber: "26028-RC-01",
      activeRevisionInvoiceNumber: "26028-RC-01-R2",
      stableDocumentInvoiceNumber: "26028-RC-01-R1",
      historicalInvoiceNumber: "26028-RC-01",
    }).displayAccountingNumber).toBe("26028-RC-01-R2");
  });
});
