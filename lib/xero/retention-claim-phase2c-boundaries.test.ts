import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const worker = read("lib/xero/retention-claim-push-worker.ts");
const updateWorker = read("lib/xero/retention-claim-update-worker.ts");
const refresh = read("lib/xero/retention-claim-revision-refresh.ts");
const actions = read(
  "app/app/(workspace)/projects/[projectId]/preconstruction/retention/actions.ts",
);
const panel = read("components/app/RetentionClaimXeroPanel.tsx");
const legacyPaymentRefresh = read(
  "lib/retention/phase10-payment-reconciliation.ts",
);
const preparation = read(
  "lib/xero/retention-claim-push-preparation.ts",
);
const decisionServer = read(
  "lib/xero/retention-claim-accounting-decision-server.ts",
);
const accountingFoundation = read(
  "supabase/migrations/20260725130000_add_immutable_accounting_foundation_phase2a.sql",
);

describe("Retention Claim Phase 2C execution boundaries", () => {
  it("searches the exact number before create and again after uncertain create", () => {
    // One import plus the mandatory pre-create and uncertain recovery calls.
    expect(worker.match(/findXeroInvoicesByNumber/g)).toHaveLength(3);
    const execution = worker.slice(worker.indexOf("// Search before every create"));
    expect(execution.indexOf("findXeroInvoicesByNumber")).toBeLessThan(
      execution.indexOf("createXeroInvoices"),
    );
    expect(worker).toContain("duplicate_invoice_number");
    expect(worker).toContain("ambiguous_create_recovery");
    expect(worker).toContain("create_outcome_uncertain");
  });

  it("freshly verifies the voided and unsettled predecessor", () => {
    expect(worker).toContain("predecessorIsSafelyVoided");
    expect(worker).toContain('text(row, "Status", "status") === "VOIDED"');
    expect(worker).toContain('list(row, "Payments", "payments").length === 0');
    expect(worker).toContain('list(row, "CreditNotes", "creditNotes").length === 0');
  });

  it("uses only persisted structured revision payload for cumulative updates", () => {
    expect(updateWorker).toContain("revision.payload_snapshot");
    expect(updateWorker).not.toContain("pdfBase64");
    expect(updateWorker).not.toContain("putXeroInvoiceAttachment");
    expect(updateWorker).not.toContain('from("retention_claims")');
    expect(updateWorker).not.toContain('from("retention_claim_allocations")');
  });

  it("keeps invoice and attachment completion independent", () => {
    expect(worker).toContain("executeRetentionClaimPushAttachment");
    expect(worker).toContain("attachment_upload_failed");
    expect(worker).toContain(
      "The Xero invoice was created, but its immutable PDF attachment requires attention.",
    );
  });

  it("refresh writes observation/event evidence and never Retention operations", () => {
    expect(refresh).toContain("record_accounting_remote_observation_phase2a");
    expect(refresh).toContain("organization_accounting_events");
    expect(refresh).not.toContain('.from("retention_claims").update');
    expect(refresh).not.toContain("apply_retention_claim");
    expect(refresh).toContain("operationalRetentionClaimMutated: false");
    expect(legacyPaymentRefresh).toContain(
      'integration_contract === "retention_claim_revision_v1"',
    );
    expect(legacyPaymentRefresh).toContain(
      '"immutable_accounting_refresh_required"',
    );
  });

  it("does not classify a generic 404 as permanent loss", () => {
    expect(refresh).toContain('"provider_missing_observed"');
    expect(refresh).toContain("permanent: params.error");
    expect(refresh).toContain("? false");
    expect(refresh).toContain("has not been classified as permanent");
  });

  it("executes the persisted financial job immediately after confirmation", () => {
    const confirmAction = actions.slice(
      actions.indexOf("async function confirmRetentionClaimPushPrepared"),
      actions.indexOf("export async function confirmRetentionClaimPushAction"),
    );
    expect(confirmAction).toContain("jobId: confirmation.jobId");
    expect(confirmAction).toContain("retention-claim-confirm-");
    expect(confirmAction).not.toContain("retention-claim-attachment-");
    expect(confirmAction).toContain("runXeroSyncWorker");
  });

  it("reloads the completed panel using real remote-observation columns", () => {
    const observationQuery = decisionServer.slice(
      decisionServer.indexOf('admin.from("organization_accounting_remote_observations")'),
      decisionServer.indexOf('admin.from("organization_accounting_sync_jobs")'),
    );
    expect(accountingFoundation).toContain(
      "accounting_revision_id, observed_at desc, id desc",
    );
    expect(observationQuery).toContain('.order("observed_at", { ascending: false })');
    expect(observationQuery).toContain('.order("id", { ascending: false })');
    expect(observationQuery).not.toContain('.order("created_at"');
  });

  it("performs adoption only inside the deliberate Push action", () => {
    expect(actions).toContain("adoptLegacyVoidedRetentionClaimIfNeeded");
    const loadAction = actions.slice(
      actions.indexOf("async function prepareRetentionClaimPushProposal"),
      actions.indexOf("export async function loadRetentionClaimPushProposalAction"),
    );
    expect(loadAction.indexOf("adoptLegacyVoidedRetentionClaimIfNeeded"))
      .toBeLessThan(loadAction.indexOf("buildRetentionClaimPushProposal"));
    expect(panel).not.toContain("adoptLegacyVoidedRetentionClaimIfNeeded");
  });

  it("finalises Draft evidence before building a proposal and never posts to Xero", () => {
    const loadAction = actions.slice(
      actions.indexOf("async function prepareRetentionClaimPushProposal"),
      actions.indexOf("export async function loadRetentionClaimPushProposalAction"),
    );
    expect(loadAction.indexOf("prepareRetentionClaimForXeroPreview"))
      .toBeLessThan(loadAction.indexOf("buildRetentionClaimPushProposal"));
    expect(loadAction).not.toContain("runXeroSyncWorker");
    expect(loadAction).not.toContain("createXeroInvoices");
    expect(preparation).toContain("submitClaim");
    expect(preparation).toContain("reloadClaim");
    expect(preparation).toContain("await dependencies.submitClaim");
    expect(loadAction).not.toContain("generateRetentionClaimPreviewDocument");
  });

  it("shows one server-authoritative Push action without a browser preview", () => {
    expect(panel).toContain('"Push to Xero"');
    expect(panel).not.toContain("Create Replacement");
    expect(panel).not.toContain("Replace Invoice");
    expect(panel).not.toContain("Sync to Xero");
    expect(panel).toContain("pushRetentionClaimToXeroAction");
    expect(panel).not.toContain("proposalToken");
    expect(panel).not.toContain("<Dialog");
    expect(panel).not.toContain(">Cancel<");
  });
});
