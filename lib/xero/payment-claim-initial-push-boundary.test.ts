import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const worker = read("lib/xero/payment-claim-initial-push-worker.ts");
const proposal = read("lib/xero/payment-claim-initial-push-proposal.ts");
const confirmation = read("lib/xero/payment-claim-initial-push-confirmation.ts");
const actions = read("app/app/(workspace)/projects/[projectId]/preconstruction/claims/[claimId]/actions.ts");
const actionErrorLogging = read("lib/xero/payment-claim-action-error-logging.ts");
const panel = read("components/app/PaymentClaimXeroPanel.tsx");
const sync = read("lib/xero/sync.ts");

describe("Payment Claim Phase 2B route boundary", () => {
  it("separates proposal and confirmation actions and accepts no browser accounting values", () => {
    expect(actions).toContain("loadPaymentClaimPushProposalAction");
    expect(actions).toContain("confirmPaymentClaimPushAction");
    expect(actions).toContain("proposalToken: string");
    expect(actions).not.toMatch(/confirmPaymentClaimPushAction[\\s\\S]{0,200}total/i);
    expect(confirmation).toContain("buildPaymentClaimPushProposal");
    expect(confirmation).toContain("initialPushProposalMatchesToken");
    expect(confirmation).toContain('confirm_payment_claim_push_phase2c');
    expect(actions).toContain("persistPaymentClaimPushProposal");
    expect(proposal).toContain("The accounting preview has expired.");
    expect(confirmation).toContain('"stale_proposal"');
  });

  it("maps known proposal validation failures to safe correlated action errors", () => {
    expect(actions).toContain("error instanceof PaymentClaimXeroPayloadError");
    expect(actions).toContain('error.code === "not_ready" ? "payment_claim_not_ready" : error.code');
    expect(actions).toContain("logPaymentClaimProposalValidationError");
    expect(actionErrorLogging).toContain('import "server-only"');
    expect(actionErrorLogging).toContain("Payment Claim Xero proposal validation failed.");
    expect(actionErrorLogging).toContain("supportReference: reference");
    expect(actionErrorLogging).toContain("resolvedAccountTaxType");
    expect(actionErrorLogging).not.toContain("error.diagnostics?.payload");
  });

  it("executes the exact confirmed job immediately instead of waiting for cron", () => {
    expect(actions).toContain("runXeroSyncWorker");
    expect(actions).toContain("organizationId: token.organizationId");
    expect(actions).toContain("jobId: confirmation.jobId");
    expect(actions).toContain("limit: 1");
  });

  it("executes the exact manual refresh job immediately instead of waiting for cron", () => {
    expect(actions).toContain("const refresh = await enqueuePaymentClaimXeroRefreshForCurrentUser");
    expect(actions).toContain("organizationId: refresh.organizationId");
    expect(actions).toContain("jobId: refresh.jobId");
    expect(actions).toContain("workerId: `payment-claim-refresh-${refresh.jobId}`");
  });

  it("builds the proposal from authoritative readiness, payload and exact PDF services", () => {
    expect(proposal).toContain("resolvePaymentClaimXeroReadinessContext");
    expect(proposal).toContain("buildPaymentClaimXeroPayloadFromResolvedSnapshot");
    expect(proposal).toContain("generatePaymentClaimPdfBundleServer");
    expect(proposal).toContain("evaluate_retention_ownership_phase2a");
    expect(proposal).toContain(
      'const invoiceNumber = decision.operation === "ACCOUNTING_UPDATE"',
    );
    expect(proposal).toContain(
      "text(dependencies.accountingDocument?.external_document_number)",
    );
    expect(proposal).toContain(
      'decision.operation !== "ACCOUNTING_UPDATE"',
    );
    expect(proposal).toContain(
      '["NZ", "NZL", "NEW ZEALAND"].includes(organizationCountry)',
    );
    expect(proposal).toContain("`${proposal.invoiceNumber}-r0001-${safeClaimNumber}.pdf`");
    expect(proposal).not.toContain("Reserved upon confirmation");
  });

  it("executes only immutable revision evidence and never reloads project claims", () => {
    expect(worker).toContain("get_payment_claim_initial_push_execution_phase2b");
    expect(worker).not.toContain("project_claims");
    expect(worker).not.toContain("resolvePaymentClaimXeroReadinessContext");
    expect(worker).not.toContain("generatePaymentClaimPdfBundleServer");
    expect(worker).toContain("payload_snapshot");
    expect(worker).toContain("pdfBase64");
    expect(worker).toContain("parseXeroDate((authoritative as Row).UpdatedDateUTC)");
    expect(worker).toContain("matchesInitialPushRecoveryCandidate");
    expect(worker).not.toContain("TSI");
  });

  it("isolates revision-backed documents from the legacy update worker", () => {
    expect(sync).toContain("payment_claim_revision_v1");
    expect(sync).toContain("cannot enter the legacy create or amendment worker");
    expect(sync).toContain('job.job_kind === "xero.payment_claim.initial_push"');
  });

  it("uses a one-click accessible push with no browser preview dialog", () => {
    expect(panel).toContain("pushPaymentClaimToXeroAction");
    expect(panel).toContain('pushing ? "Pushing to Xero..."');
    expect(panel).not.toContain("Create Authorised Invoice");
    expect(panel).not.toContain("TSI-########");
    expect(panel).not.toContain("<Dialog");
    expect(panel).not.toContain("proposalToken");
    expect(panel).toContain("ariaBusy={pushing}");
  });

  it("does not alter Retention Claim implementation or operational claims", () => {
    expect(worker).not.toContain("retention_claims");
    expect(worker).not.toContain("project_claims");
    expect(worker).not.toContain("paid_amount");
    expect(worker).not.toContain("project_claims.status");
  });
});
