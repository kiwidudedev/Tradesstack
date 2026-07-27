import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const panel = read("components/app/PaymentClaimXeroPanel.tsx");
const actions = read("app/app/(workspace)/projects/[projectId]/preconstruction/claims/[claimId]/actions.ts");
const proposal = read("lib/xero/payment-claim-initial-push-proposal.ts");
const confirmation = read("lib/xero/payment-claim-initial-push-confirmation.ts");
const decision = read("lib/xero/payment-claim-accounting-decision.ts");
const worker = read("lib/xero/payment-claim-replacement-worker.ts");
const refresh = read("lib/xero/payment-claim-sales-invoice-refresh.ts");
const sync = read("lib/xero/sync.ts");
const migration = read("supabase/migrations/20260726210000_add_payment_claim_replacement_phase2c.sql");
const proposalMigration = read("supabase/migrations/20260726220000_add_payment_claim_push_proposal_ledger_phase2c.sql");
const proposalPersistenceMigration = read("supabase/migrations/20260726230000_persist_payment_claim_push_proposals_phase2c.sql");
const confirmedMissingMigration = read("supabase/migrations/20260726240000_allow_confirmed_missing_payment_claim_replacement_phase2c.sql");
const adoption = read("lib/xero/payment-claim-legacy-adoption.ts");
const adoptionMigration = read("supabase/migrations/20260726260000_adopt_legacy_voided_payment_claim.sql");

describe("unified Payment Claim Push to Xero boundary", () => {
  it("exposes one browser accounting action and accepts no operation selector", () => {
    expect(panel).toContain("pushPaymentClaimToXeroAction");
    expect(panel).toContain("state.actionLabel");
    for (const forbidden of [
      "Sync to Xero",
      "Sync amended claim",
      "Create Replacement",
      "Replace Invoice",
      "Retry Replacement",
      "Create Authorised Invoice",
    ]) {
      expect(panel).not.toContain(forbidden);
    }
    expect(actions).toContain("loadPaymentClaimPushProposalAction");
    expect(actions).toContain("confirmPaymentClaimPushAction");
    expect(actions).toContain("pushPaymentClaimToXeroAction");
    expect(actions).not.toMatch(/loadPaymentClaimPushProposalAction[\\s\\S]{0,200}operation:/);
    expect(actions).not.toMatch(/confirmPaymentClaimPushAction[\\s\\S]{0,200}operation:/);
    expect(actions).toContain("supportReference: string | null");
    expect(actions).toContain('"proposal_stale"');
    expect(actions).toContain('"previous_invoice_not_voided"');
    expect(actions).toContain('"xero_connection_unavailable"');
    expect(actions).toContain('"xero_invoice_rejected"');
    expect(actions).toContain('"invoice_result_uncertain"');
    expect(actions).not.toContain(
      "The Xero Sales Invoice action could not be completed.",
    );
    expect(panel).toContain("Support reference:");
    expect(panel).toContain(
      "was created successfully, but its PDF attachment failed",
    );
  });

  it("recalculates the server operation for proposal and confirmation", () => {
    expect(proposal).toContain("resolvePaymentClaimAccountingOperationForState");
    expect(confirmation).toContain("buildPaymentClaimPushProposal");
    expect(decision).toContain("resolvePaymentClaimAccountingOperation");
    expect(worker).toContain("resolvePaymentClaimAccountingOperation");
    expect(actions).toContain("persistPaymentClaimPushProposal");
    expect(confirmation).toContain('confirm_payment_claim_push_phase2c');
    expect(proposalMigration).toContain("organization_accounting_push_proposals");
    expect(proposalMigration).toContain("prevent_accounting_push_proposal_mutation");
    expect(proposalMigration).toContain("v_proposal.operation = 'INITIAL_EXPORT'");
    expect(proposalMigration).toContain("v_proposal.operation = 'REPLACEMENT_EXPORT'");
    expect(proposalPersistenceMigration).toContain("persist_payment_claim_push_proposal_phase2c");
    expect(proposalPersistenceMigration).toContain("'replacement_proposed'");
    expect(confirmedMissingMigration).toContain("provider_missing_confirmed");
    expect(confirmedMissingMigration).toContain("and not v_missing_confirmed");
  });

  it("keeps the initial worker isolated and adds an intent-persisted replacement worker", () => {
    expect(sync).toContain('job.job_kind === "xero.payment_claim.replacement"');
    expect(worker).toContain('revision.revision_intent !== "replacement"');
    expect(worker).toContain('execution.attempt.attempt_intent !== "replace"');
    expect(worker).toContain('payload.Type !== "ACCREC"');
    expect(worker).toContain('payload.Status !== "AUTHORISED"');
    expect(worker).toContain("getXeroInvoice(");
    expect(worker).toContain("providerState: predecessorState");
    expect(worker).toContain("hasPayments:");
    expect(worker).toContain("hasCredits:");
    expect(worker).toContain('event_type: "blocked"');
    expect(worker.indexOf("const existingCandidates = await findXeroInvoicesByNumber"))
      .toBeLessThan(worker.indexOf("const created = await createXeroInvoices"));
    expect(worker).toContain("if (existingMatches.length === 1)");
    expect(worker).toContain("recovered = true");
  });

  it("uses active revision identity for Phase 2B refresh and never projects it into the claim", () => {
    expect(refresh).toContain('document.integration_contract === "payment_claim_revision_v1"');
    expect(refresh).toContain("activeRevision?.external_document_number");
    expect(refresh).toContain("record_accounting_remote_observation_phase2a");
    expect(refresh).toContain("claimProjectionApplied: false");
  });

  it("adds replacement lineage, numbering, attempts, events and atomic activation forward-only", () => {
    expect(migration).toContain("'revisionIntent', 'replacement'");
    expect(migration).toContain("'resolutionStrategy', 'replacement'");
    expect(migration).toContain("'previousRevisionId', v_previous.id");
    expect(migration).toContain("v_claim_row.claim_number || '-R' || v_replacement_sequence");
    expect(migration).toContain("v_revision.id, 'replace'");
    expect(migration).toContain("activate_successful_accounting_revision_phase2a");
    for (const event of [
      "decision_resolved",
      "replacement_confirmed",
      "replacement_succeeded",
      "replacement_recovered",
    ]) {
      expect(migration).toContain(event);
    }
  });

  it("adopts a legacy VOIDED predecessor only after Push is clicked and before proposal construction", () => {
    expect(actions.indexOf(
      "const adopt = () => adoptLegacyVoidedPaymentClaimIfNeeded",
    )).toBeLessThan(actions.indexOf(
      "const build = () => buildPaymentClaimPushProposal",
    ));
    expect(adoption).toContain("getXeroInvoice(");
    expect(adoption).toContain("findXeroInvoicesByNumber");
    expect(adoption).toContain('type: "ACCREC"');
    expect(adoption).toContain('invoice.Status !== "VOIDED"');
    expect(adoption).toContain('"adopt_legacy_voided_payment_claim_phase2c"');
    expect(adoption).not.toContain("createXeroInvoices");
    expect(adoptionMigration).toContain("'legacy_import'");
    expect(adoptionMigration).toContain("'legacy_preservation'");
    expect(adoptionMigration).not.toMatch(/update\s+public\.project_claims/i);
  });
});
