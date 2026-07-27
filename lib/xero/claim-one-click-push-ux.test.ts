import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const paymentPanel = read("components/app/PaymentClaimXeroPanel.tsx");
const retentionPanel = read("components/app/RetentionClaimXeroPanel.tsx");
const sharedPanel = read("components/app/AccountingSyncPanel.tsx");
const paymentActions = read(
  "app/app/(workspace)/projects/[projectId]/preconstruction/claims/[claimId]/actions.ts",
);
const retentionActions = read(
  "app/app/(workspace)/projects/[projectId]/preconstruction/retention/actions.ts",
);
const orchestration = read("lib/xero/one-click-claim-push.ts");
const paymentConfirmation = read(
  "lib/xero/payment-claim-initial-push-confirmation.ts",
);
const retentionConfirmation = read(
  "lib/xero/retention-claim-push-confirmation.ts",
);
const retentionUpdateWorker = read(
  "lib/xero/retention-claim-update-worker.ts",
);
const retentionDecision = read(
  "lib/xero/retention-claim-accounting-decision.ts",
);

describe("claim Push to Xero one-click browser contract", () => {
  it.each([
    ["Payment Claim", paymentPanel],
    ["Retention Claim", retentionPanel],
  ])("removes every %s preview and confirmation modal primitive", (_name, source) => {
    for (const removed of [
      "<Dialog",
      "DialogContent",
      "DialogFooter",
      "DialogClose",
      "proposalToken",
      "setPreview",
      "previewOpen",
      ">Cancel<",
    ]) {
      expect(source).not.toContain(removed);
    }
  });

  it("sends only Payment Claim identity from the browser", () => {
    expect(paymentPanel).toContain(
      "pushPaymentClaimToXeroAction({\n      claimId: props.claimId,\n    })",
    );
    expect(paymentPanel).not.toMatch(
      /pushPaymentClaimToXeroAction\(\{[\s\S]{0,160}(operation|proposalId|invoiceId|total|tenant)/i,
    );
  });

  it("sends only Retention Claim identity from the browser", () => {
    expect(retentionPanel).toContain(
      "pushRetentionClaimToXeroAction({\n      retentionClaimId: props.retentionClaimId,\n    })",
    );
    expect(retentionPanel).not.toMatch(
      /pushRetentionClaimToXeroAction\(\{[\s\S]{0,180}(operation|proposalId|invoiceId|total|tenant)/i,
    );
  });

  it("uses one shared server orchestration sequence", () => {
    expect(paymentActions).toContain("executeOneClickClaimPush<");
    expect(retentionActions).toContain("executeOneClickClaimPush<");
    expect(orchestration.indexOf("params.prepare()")).toBeLessThan(
      orchestration.indexOf("params.confirm("),
    );
    expect(orchestration.indexOf("params.confirm(prepared.proposalToken)"))
      .toBeLessThan(orchestration.indexOf("params.recover(completed)"));
  });

  it("keeps immutable proposal construction and persistence server-side", () => {
    expect(paymentActions).toContain("buildPaymentClaimPushProposal");
    expect(paymentActions).toContain("persistPaymentClaimPushProposal");
    expect(retentionActions).toContain("buildRetentionClaimPushProposal");
    expect(retentionActions).toContain("persistRetentionClaimPushProposal");
  });

  it("keeps proposal validation and immutable confirmation server-side", () => {
    for (const confirmation of [paymentConfirmation, retentionConfirmation]) {
      expect(confirmation).toContain("sourceEvidenceHash");
      expect(confirmation).toContain("commercialHash");
      expect(confirmation).toContain("linesHash");
      expect(confirmation).toContain("active_revision");
    }
    expect(paymentConfirmation).toContain("confirm_payment_claim_push_phase2c");
    expect(retentionConfirmation).toContain(
      "confirm_master_retention_claim_update",
    );
  });

  it("executes the durable worker immediately and reloads Accounting Sync", () => {
    for (const actions of [paymentActions, retentionActions]) {
      expect(actions).toContain("runXeroSyncWorker({");
    }
    expect(paymentActions).toContain("getPaymentClaimXeroPanelState");
    expect(retentionActions).toContain(
      "getRetentionClaimImmutableXeroPanel",
    );
  });

  it("preserves automatic local recovery after a durable provider result", () => {
    expect(paymentActions).toContain(
      "state.status === \"synced\" ? { ok: true, state } : failed",
    );
    expect(retentionActions).toContain(
      "state.status === \"synced\" ? { ok: true, state } : failed",
    );
    expect(retentionUpdateWorker).toContain("RETENTION_UPDATE_RECOVERED");
    expect(retentionUpdateWorker).toContain("getXeroInvoice(");
  });

  it("preserves same-InvoiceID update and replacement decisions", () => {
    expect(retentionDecision).toContain(
      'operation: "UPDATE_EXISTING_INVOICE"',
    );
    expect(retentionDecision).toContain('operation: "REPLACEMENT_EXPORT"');
    expect(retentionUpdateWorker).toContain("updateXeroSalesInvoice({");
    expect(retentionUpdateWorker).toContain("invoiceId,");
    expect(retentionUpdateWorker).not.toContain("createXeroSalesInvoice");
  });

  it("uses an inline accessible loading state without an overlay", () => {
    for (const panel of [paymentPanel, retentionPanel]) {
      expect(panel).toContain('pushing ? "Pushing to Xero..."');
      expect(panel).toMatch(/ariaBusy=\{pushing(?: \|\| resetting)?\}/);
      expect(panel).not.toContain("fullScreenMobile");
    }
    expect(sharedPanel).toContain("aria-busy={props.ariaBusy || undefined}");
  });

  it("guards local double-clicks while durable server idempotency remains active", () => {
    expect(paymentPanel).toContain("if (pushing) return");
    expect(retentionPanel).toContain("if (pushing) return");
    expect(paymentConfirmation).toContain("proposalId");
    expect(retentionConfirmation).toContain("confirmation_preview_hash");
  });

  it("does not alter accounting schemas or domain safety code", () => {
    expect(paymentActions).toContain("getOrganizationPermissionsBatch");
    expect(retentionActions).toContain("getOrganizationPermissionsBatch");
    expect(retentionConfirmation).toContain("previousObservationId");
    expect(retentionUpdateWorker).toContain("assertUnpaidAuthorised");
  });
});
