import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { resolveRetentionClaimAccountingOperation } from "./retention-claim-accounting-decision";
import { resolveRetentionClaimAccountingDrift } from "./retention-claim-accounting-drift";
import {
  RetentionClaimProposalDecisionError,
  proposalDecisionError,
} from "./retention-claim-proposal-decision-error";
import { recoverSynchronizedRetentionClaimPanel } from "./retention-claim-stale-panel-recovery";

const H1 = "1".repeat(64);
const H2 = "2".repeat(64);
const H3 = "3".repeat(64);

const decisionBase = {
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
  activeInvoiceNumber: "26030-RC-01",
  replacementNumber: "26030-RC-01-R1",
  connectionMatches: true,
  tenantMatches: true,
  hasInvoiceScope: true,
  providerAvailable: true,
  providerState: "authorised" as const,
  amountPaidMinor: 0,
  amountDueMinor: 100000,
  amountCreditedMinor: 0,
  hasPayments: false,
  hasCredits: false,
  financialDivergence: false,
  contentDivergence: false,
  claimChangedAfterExport: false,
  canRefresh: true,
};

describe("Retention Claim authoritative panel drift", () => {
  it("binds panel and proposal construction to one structured source loader", () => {
    const panel = readFileSync(
      "lib/xero/retention-claim-immutable-panel.ts",
      "utf8",
    );
    const source = readFileSync(
      "lib/xero/retention-claim-sales-invoice.ts",
      "utf8",
    );
    const proposal = readFileSync(
      "lib/xero/retention-claim-push-proposal.ts",
      "utf8",
    );

    expect(source).toContain(
      "export async function loadRetentionClaimStructuredSourceAccess",
    );
    expect(source).toContain(
      "? await loadRetentionClaimStructuredSourceAccess(retentionClaimId)",
    );
    expect(panel).toContain(
      "loadRetentionClaimStructuredSourceAccess(retentionClaimId)",
    );
    expect(panel).toContain(
      "structuredSourceAccess.source?.claim.submissionStateHash",
    );
    expect(panel).not.toContain("claim.submission_state_hash");
    expect(proposal).toContain(
      "resolved.source.claim.submissionStateHash",
    );
  });

  it("ignores an unrelated persisted submission hash when structured evidence matches", () => {
    const persistedSubmissionHash = H2;
    const drift = resolveRetentionClaimAccountingDrift({
      activeStructuredSourceHash: H1,
      currentStructuredSourceHash: H1,
      activeIssueDate: "2026-08-01",
      currentIssueDate: "2026-08-01",
      activeDueDate: "2026-08-31",
      currentDueDate: "2026-08-31",
    });

    expect(persistedSubmissionHash).not.toBe(H1);
    expect(drift).toEqual({
      financialChangedAfterExport: false,
      dateChangedAfterExport: false,
      claimChangedAfterExport: false,
    });
    expect(resolveRetentionClaimAccountingOperation({
      ...decisionBase,
      claimChangedAfterExport: drift.claimChangedAfterExport,
    })).toMatchObject({
      operation: "BLOCKED",
      canPush: false,
      blockers: [{ code: "already_exported" }],
    });
  });

  it("routes real structured amount or allocation drift to the same-invoice update", () => {
    const drift = resolveRetentionClaimAccountingDrift({
      activeStructuredSourceHash: H1,
      currentStructuredSourceHash: H3,
      activeIssueDate: "2026-08-01",
      currentIssueDate: "2026-08-01",
      activeDueDate: "2026-08-31",
      currentDueDate: "2026-08-31",
    });

    expect(drift).toMatchObject({
      financialChangedAfterExport: true,
      dateChangedAfterExport: false,
      claimChangedAfterExport: true,
    });
    expect(resolveRetentionClaimAccountingOperation({
      ...decisionBase,
      claimChangedAfterExport: drift.claimChangedAfterExport,
    })).toMatchObject({
      operation: "UPDATE_EXISTING_INVOICE",
      workerKind: "xero.retention_claim.update",
      replacementNumber: null,
    });
  });

  it("keeps date-only drift independent of the structured source hash", () => {
    expect(resolveRetentionClaimAccountingDrift({
      activeStructuredSourceHash: H1,
      currentStructuredSourceHash: H1,
      activeIssueDate: "2026-08-01",
      currentIssueDate: "2026-08-02",
      activeDueDate: "2026-08-31",
      currentDueDate: "2026-08-31",
    })).toEqual({
      financialChangedAfterExport: false,
      dateChangedAfterExport: true,
      claimChangedAfterExport: true,
    });
  });
});

describe("Retention Claim synchronized proposal result", () => {
  it("wires the typed no-op through action mapping and stale panel recovery", () => {
    const actions = readFileSync(
      "app/app/(workspace)/projects/[projectId]/preconstruction/retention/actions.ts",
      "utf8",
    );
    const proposal = readFileSync(
      "lib/xero/retention-claim-push-proposal.ts",
      "utf8",
    );

    expect(proposal).toContain("throw proposalDecisionError(decisionBlocker)");
    expect(actions).toContain(
      "error instanceof RetentionClaimProposalDecisionError",
    );
    expect(actions).toContain("recoverSynchronizedRetentionClaimPanel({");
    expect(actions.indexOf("persistRetentionClaimPushProposal"))
      .toBeLessThan(actions.indexOf("recoverSynchronizedRetentionClaimPanel({"));
  });

  it("preserves already_exported as a typed expected domain result", () => {
    const error = proposalDecisionError({
      code: "already_exported",
      message: "The current Retention Claim is already authorised in Xero.",
    });

    expect(error).toBeInstanceOf(RetentionClaimProposalDecisionError);
    expect(error).toMatchObject({
      code: "already_exported",
      message: "This Retention Claim is already synchronized with Xero.",
    });
  });

  it("reloads a stale panel as a safe synchronized no-op", async () => {
    const loadPanel = vi.fn().mockResolvedValue({
      status: "synced",
      statusLabel: "Synced",
      actionLabel: null,
    });
    const failed = {
      ok: false as const,
      error: {
        code: "already_exported",
        message: "This Retention Claim is already synchronized with Xero.",
        supportReference: null,
      },
    };

    await expect(recoverSynchronizedRetentionClaimPanel({
      failed,
      loadPanel,
    })).resolves.toEqual({
      ok: true,
      state: {
        status: "synced",
        statusLabel: "Synced",
        actionLabel: null,
      },
    });
    expect(loadPanel).toHaveBeenCalledTimes(1);
  });

  it("does not hide genuine failures or non-synced reloads", async () => {
    const infrastructureFailure = {
      ok: false as const,
      error: {
        code: "database_failure",
        message: "TradesStack could not complete the action.",
        supportReference: "support-1",
      },
    };
    const loadPanel = vi.fn().mockResolvedValue({ status: "update_required" });

    await expect(recoverSynchronizedRetentionClaimPanel({
      failed: infrastructureFailure,
      loadPanel,
    })).resolves.toBe(infrastructureFailure);
    expect(loadPanel).not.toHaveBeenCalled();

    const alreadyExported = {
      ok: false as const,
      error: {
        code: "already_exported",
        message: "This Retention Claim is already synchronized with Xero.",
        supportReference: null,
      },
    };
    await expect(recoverSynchronizedRetentionClaimPanel({
      failed: alreadyExported,
      loadPanel,
    })).resolves.toBe(alreadyExported);
  });
});
