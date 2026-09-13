import { describe, expect, it } from "vitest";
import {
  formatRegisterDate,
  formatRegisterMonth,
  formatTrustedMinorAmount,
  parseCompanyPaymentClaimsFilters,
  paymentStatusLabel,
  xeroStatusLabel,
} from "./company-register-presentation";
import type { CompanyPaymentClaimRegisterRow } from "@/app/app/(workspace)/company/payment-claims/payment-claim-register-types";

const row = {
  currency: "NZD",
  divergent: false,
} as CompanyPaymentClaimRegisterRow;

describe("company Payment Claims presentation", () => {
  it("parses shareable URL filters and sanitizes pagination and sorting", () => {
    expect(parseCompanyPaymentClaimsFilters({
      month: "2026-07",
      search: " PC-10 ",
      outstanding: "1",
      overdue: "true",
      attention: "yes",
      sort: "amount",
      direction: "asc",
      page: "3",
    })).toMatchObject({
      month: "2026-07",
      search: "PC-10",
      outstandingOnly: true,
      overdueOnly: true,
      attentionOnly: true,
      sort: "amount",
      direction: "asc",
      page: 3,
    });
    const defaultFilters = parseCompanyPaymentClaimsFilters({
      sort: "unsafe",
      direction: "sideways",
      page: "-2",
    });
    expect(defaultFilters).toMatchObject({ sort: "period", direction: "desc", page: 1 });
    expect(defaultFilters.month).toBeNull();
  });

  it("formats persisted dates without timezone drift", () => {
    expect(formatRegisterDate("2026-07-01")).toBe("01/07/2026");
    expect(formatRegisterDate(null)).toBe("—");
    expect(formatRegisterMonth("2026-07")).toBe("July 2026");
    expect(formatRegisterMonth("all")).toBe("All periods");
  });

  it("does not present divergent or missing projections as zero", () => {
    expect(formatTrustedMinorAmount(null, row)).toBe("—");
    expect(formatTrustedMinorAmount(12550, { ...row, divergent: true })).toBe("—");
    expect(formatTrustedMinorAmount(12550, row)).toContain("125.50");
  });

  it("keeps Xero and payment labels independent", () => {
    expect(xeroStatusLabel("queued")).toBe("Queued");
    expect(paymentStatusLabel("unpaid", false)).toBe("Unpaid");
    expect(paymentStatusLabel("paid", true)).toBe("Attention required");
  });
});
