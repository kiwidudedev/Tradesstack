import { describe, expect, it } from "vitest";
import {
  nextRetentionClaimReplacementNumber,
  retentionInheritedEvidenceChanged,
  resolveRetentionClaimAccountingOperation,
  type RetentionClaimAccountingDecisionInput,
} from "./retention-claim-accounting-decision";

const base: RetentionClaimAccountingDecisionInput = {
  featureEnabled: true,
  hasPushPermission: true,
  readinessReady: true,
  retentionOwnershipValid: true,
  hasActiveFinancialWork: false,
  hasUncertainFinancialResult: false,
  hasStableDocument: true,
  hasActiveRevision: true,
  legacyAdoptionEligible: false,
  activeInvoiceId: "invoice-1",
  activeInvoiceNumber: "26028-RC-01",
  replacementNumber: "26028-RC-01-R1",
  connectionMatches: true,
  tenantMatches: true,
  hasInvoiceScope: true,
  providerAvailable: true,
  providerState: "authorised",
  amountPaidMinor: 0,
  amountDueMinor: 11500,
  amountCreditedMinor: 0,
  hasPayments: false,
  hasCredits: false,
  financialDivergence: false,
  contentDivergence: false,
  claimChangedAfterExport: false,
  canRefresh: true,
};

describe("Retention Claim accounting decision engine", () => {
  it("uses the commercial RC number and never a historical TSI number", () => {
    expect(nextRetentionClaimReplacementNumber("26028-RC-01", [])).toBe("26028-RC-01-R1");
    expect(nextRetentionClaimReplacementNumber(
      "26028-RC-01",
      ["TSI-00000002", "26028-RC-01-R1"],
    )).toBe("26028-RC-01-R2");
  });

  it("routes a never-exported Retention Claim to initial export", () => {
    expect(resolveRetentionClaimAccountingOperation({
      ...base,
      hasStableDocument: false,
      hasActiveRevision: false,
      activeInvoiceId: null,
      activeInvoiceNumber: null,
      providerState: "not_exported",
      canRefresh: false,
    })).toMatchObject({
      operation: "INITIAL_EXPORT",
      canPush: true,
      canRefresh: false,
      workerKind: "xero.retention_claim.initial_push",
    });
  });

  it("blocks an unchanged authorised invoice but keeps Refresh", () => {
    expect(resolveRetentionClaimAccountingOperation(base)).toMatchObject({
      operation: "BLOCKED",
      canPush: false,
      canRefresh: true,
      blockers: [{ code: "already_exported" }],
    });
  });

  it("routes a confirmed voided and unsettled invoice to replacement", () => {
    expect(resolveRetentionClaimAccountingOperation({
      ...base,
      providerState: "voided",
    })).toMatchObject({
      operation: "REPLACEMENT_EXPORT",
      canPush: true,
      canRefresh: true,
      workerKind: "xero.retention_claim.replacement",
      replacementNumber: "26028-RC-01-R1",
    });
  });

  it("routes eligible historical identity through server adoption", () => {
    expect(resolveRetentionClaimAccountingOperation({
      ...base,
      hasActiveRevision: false,
      legacyAdoptionEligible: true,
      providerState: "voided",
    })).toMatchObject({
      operation: "LEGACY_ADOPTION_REQUIRED",
      canPush: true,
      proposalType: "legacy_adoption",
    });
  });

  it.each([
    ["paid", { providerState: "voided", amountPaidMinor: 11500, amountDueMinor: 0 }, "payments_exist"],
    ["part-paid", { providerState: "voided", amountPaidMinor: 5000, amountDueMinor: 6500 }, "partial_payment_exists"],
    ["credited", { providerState: "voided", amountCreditedMinor: 100 }, "credits_exist"],
    ["wrong tenant", { providerState: "voided", tenantMatches: false }, "wrong_tenant"],
    ["missing scope", { providerState: "voided", hasInvoiceScope: false }, "missing_scope"],
    ["unknown", { providerState: "unknown" }, "provider_unknown"],
    ["financial divergence", { providerState: "voided", financialDivergence: true }, "financial_divergence"],
    ["content divergence", { providerState: "voided", contentDivergence: true }, "content_divergence"],
    ["active create", { providerState: "voided", hasActiveFinancialWork: true }, "active_work"],
    ["uncertain create", { providerState: "voided", hasUncertainFinancialResult: true }, "uncertain_result"],
    ["ownership change", { providerState: "voided", retentionOwnershipValid: false }, "retention_ownership_invalid"],
  ] as const)("blocks %s", (_label, overrides, code) => {
    const decision = resolveRetentionClaimAccountingOperation({ ...base, ...overrides });
    expect(decision).toMatchObject({ operation: "BLOCKED", canPush: false });
    expect(decision.blockers[0]?.code).toBe(code);
  });

  it("routes new cumulative retention to the same-invoice update worker", () => {
    expect(resolveRetentionClaimAccountingOperation({
      ...base,
      claimChangedAfterExport: true,
    })).toMatchObject({
      operation: "UPDATE_EXISTING_INVOICE",
      canPush: true,
      accountingState: "update_required",
      workerKind: "xero.retention_claim.update",
    });
  });

  it("classifies inherited GST and origin-line drift as an accounting update", () => {
    expect(retentionInheritedEvidenceChanged({
      active: {
        subtotalMinor: 100000,
        taxMinor: 0,
        totalMinor: 100000,
        taxType: "NONE",
        originRevisionLineId: null,
      },
      desired: {
        subtotalMinor: 100000,
        taxMinor: 15000,
        totalMinor: 115000,
        taxType: "OUTPUT2",
        originRevisionLineId: "origin-line-1",
      },
    })).toBe(true);
    expect(resolveRetentionClaimAccountingOperation({
      ...base,
      claimChangedAfterExport: true,
    })).toMatchObject({
      operation: "UPDATE_EXISTING_INVOICE",
      workerKind: "xero.retention_claim.update",
    });
  });

  it("uses controlled replacement rather than update when the invoice is voided", () => {
    expect(resolveRetentionClaimAccountingOperation({
      ...base,
      providerState: "voided",
      claimChangedAfterExport: true,
    })).toMatchObject({
      operation: "REPLACEMENT_EXPORT",
      canPush: true,
    });
  });
});
