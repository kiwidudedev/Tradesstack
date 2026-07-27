import { describe, expect, it } from "vitest";
import {
  nextPaymentClaimReplacementNumber,
  resolvePaymentClaimAccountingOperation,
  type PaymentClaimAccountingDecisionInput,
} from "./payment-claim-accounting-decision";

const base: PaymentClaimAccountingDecisionInput = {
  featureEnabled: true,
  hasPushPermission: true,
  readinessReady: true,
  hasActiveWork: false,
  hasStableDocument: true,
  hasActiveRevision: true,
  activeRevisionIntent: "initial_push",
  activeInvoiceId: "invoice-1",
  activeInvoiceNumber: "26028-PC-01",
  replacementNumber: "26028-PC-01-R1",
  connectionMatches: true,
  tenantMatches: true,
  hasInvoiceScope: true,
  providerAvailable: true,
  providerState: "authorised",
  amountPaidMinor: 0,
  amountDueMinor: 11_500,
  amountCreditedMinor: 0,
  hasPayments: false,
  hasCredits: false,
  financialDivergence: false,
  contentDivergence: false,
  claimChangedAfterExport: false,
};

describe("Payment Claim accounting decision engine", () => {
  it("allocates R1, preserves historical CL bases, and advances to R2", () => {
    expect(nextPaymentClaimReplacementNumber("26028-PC-01", [])).toBe("26028-PC-01-R1");
    expect(nextPaymentClaimReplacementNumber("26028-CL-01", [])).toBe("26028-CL-01-R1");
    expect(nextPaymentClaimReplacementNumber(
      "26028-CL-02",
      ["TSI-00000001"],
    )).toBe("26028-CL-02-R1");
    expect(nextPaymentClaimReplacementNumber(
      "26028-PC-01",
      ["26028-PC-01", "26028-PC-01-R1", "unrelated-R8"],
    )).toBe("26028-PC-01-R2");
  });
  it("routes a never-exported claim to initial export", () => {
    const decision = resolvePaymentClaimAccountingOperation({
      ...base,
      hasStableDocument: false,
      hasActiveRevision: false,
      activeInvoiceId: null,
      activeInvoiceNumber: null,
      providerState: "not_exported",
    });
    expect(decision).toMatchObject({
      operation: "INITIAL_EXPORT",
      canPush: true,
      proposalType: "initial",
      workerKind: "xero.payment_claim.initial_push",
    });
  });

  it("routes an exactly confirmed voided invoice to replacement", () => {
    expect(resolvePaymentClaimAccountingOperation({
      ...base,
      providerState: "voided",
    })).toMatchObject({
      operation: "REPLACEMENT_EXPORT",
      canPush: true,
      proposalType: "replacement",
      replacementNumber: "26028-PC-01-R1",
    });
  });

  it.each([
    ["an active replacement job", { hasActiveWork: true }],
    ["an uncertain replacement attempt represented as active work", { hasActiveWork: true }],
  ])("blocks another Push for %s", (_label, overrides) => {
    expect(resolvePaymentClaimAccountingOperation({
      ...base,
      providerState: "voided",
      ...overrides,
    })).toMatchObject({
      operation: "BLOCKED",
      canPush: false,
      blockers: [{ code: "active_work" }],
    });
  });

  it.each([
    ["paid VOIDED", { providerState: "voided", amountPaidMinor: 11_500, amountDueMinor: 0 }, "payments_exist"],
    ["credited VOIDED", { providerState: "voided", amountCreditedMinor: 500 }, "credits_exist"],
    ["wrong-tenant VOIDED", { providerState: "voided", tenantMatches: false }, "wrong_tenant"],
    ["financially divergent VOIDED", { providerState: "voided", financialDivergence: true }, "financial_divergence"],
    ["content-divergent VOIDED", { providerState: "voided", contentDivergence: true }, "content_divergence"],
  ] as const)("keeps the %s safety blocker", (_label, overrides, code) => {
    const decision = resolvePaymentClaimAccountingOperation({ ...base, ...overrides });
    expect(decision).toMatchObject({ operation: "BLOCKED", canPush: false });
    expect(decision.blockers[0]?.code).toBe(code);
  });

  it("offers the same Push action for an eligible legacy voided predecessor before adoption", () => {
    expect(resolvePaymentClaimAccountingOperation({
      ...base,
      hasActiveRevision: false,
      activeRevisionIntent: null,
      legacyAdoptionEligible: true,
      providerState: "voided",
      activeInvoiceNumber: "26028-CL-01",
      replacementNumber: "26028-CL-01-R1",
    })).toMatchObject({
      operation: "REPLACEMENT_EXPORT",
      canPush: true,
      replacementNumber: "26028-CL-01-R1",
      accountingState: "ready_for_legacy_adoption_after_void",
    });
  });

  it("routes confirmed permanent loss to replacement but not an unconfirmed missing invoice", () => {
    expect(resolvePaymentClaimAccountingOperation({
      ...base,
      providerState: "missing_confirmed",
    }).operation).toBe("REPLACEMENT_EXPORT");
    expect(resolvePaymentClaimAccountingOperation({
      ...base,
      providerState: "missing_unconfirmed",
    })).toMatchObject({ operation: "BLOCKED", canPush: false });
  });

  it.each([
    ["paid", { providerState: "paid", amountPaidMinor: 11_500, amountDueMinor: 0 }, "payments_exist"],
    ["part paid", { providerState: "partially_paid", amountPaidMinor: 5_000 }, "partial_payment_exists"],
    ["credited", { amountCreditedMinor: 500 }, "credits_exist"],
    ["credit evidence", { hasCredits: true }, "credits_exist"],
    ["financial divergence", { financialDivergence: true }, "financial_divergence"],
    ["content divergence", { contentDivergence: true }, "content_divergence"],
    ["wrong tenant", { tenantMatches: false }, "wrong_tenant"],
    ["missing scope", { hasInvoiceScope: false }, "missing_scope"],
    ["unknown provider response", { providerState: "unknown" }, "provider_unknown"],
  ] as const)("blocks %s", (_label, overrides, code) => {
    const decision = resolvePaymentClaimAccountingOperation({ ...base, ...overrides });
    expect(decision).toMatchObject({ operation: "BLOCKED", canPush: false });
    expect(decision.blockers[0]?.code).toBe(code);
  });

  it("routes a changed exported claim to the future operation but blocks while unsupported", () => {
    expect(resolvePaymentClaimAccountingOperation({
      ...base,
      claimChangedAfterExport: true,
    }).blockers[0]?.code).toBe("future_operation_not_supported");
    expect(resolvePaymentClaimAccountingOperation({
      ...base,
      claimChangedAfterExport: true,
      futureAccountingUpdateEnabled: true,
    }).operation).toBe("ACCOUNTING_UPDATE");
  });
});
