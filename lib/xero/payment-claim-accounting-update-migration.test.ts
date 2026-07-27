import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(
  process.cwd(),
  "supabase/migrations/20260726450000_add_payment_claim_accounting_update.sql",
), "utf8");
const persistenceFix = readFileSync(join(
  process.cwd(),
  "supabase/migrations/20260726460000_allow_payment_claim_update_claim_number_identity.sql",
), "utf8");
const worker = readFileSync(join(
  process.cwd(),
  "lib/xero/payment-claim-accounting-update-worker.ts",
), "utf8");
const confirmation = readFileSync(join(
  process.cwd(),
  "lib/xero/payment-claim-initial-push-confirmation.ts",
), "utf8");
const actions = readFileSync(join(
  process.cwd(),
  "app/app/(workspace)/projects/[projectId]/preconstruction/claims/[claimId]/actions.ts",
), "utf8");

describe("immutable Payment Claim accounting update migration", () => {
  it("adds a server-only transactional confirmation with immutable lineage", () => {
    expect(migration).toContain("confirm_payment_claim_accounting_update");
    expect(migration).toContain("auth.role() <> 'service_role'");
    expect(migration).toContain("'revisionIntent', 'direct_update'");
    expect(migration).toContain("'resolutionStrategy', 'update_existing'");
    expect(migration).toContain("'previousRevisionId', v_previous.id");
    expect(migration).toContain("v_previous.external_document_id");
    expect(migration).toContain("v_previous.external_document_number");
    expect(migration).toContain("sourceOptimisticRevision");
    expect(migration).toContain("payloadHash");
    expect(migration).toContain("previousObservationId");
    expect(migration).toContain("jsonb_array_length");
  });

  it("persists one update attempt and one durable idempotent job", () => {
    expect(migration).toContain(
      "organization_accounting_sync_jobs_active_payment_update_uidx",
    );
    expect(migration).toContain("v_revision.id,\n    'update'");
    expect(migration).toContain("'xero:payment_claim:accounting_update:'");
    expect(migration).toContain("'xero.payment_claim.accounting_update'");
    expect(migration).toContain("'intent', 'direct_update'");
    expect(migration).toContain("confirmation_preview_hash");
  });

  it("keeps the predecessor active until exact verified completion", () => {
    expect(migration).toContain(
      "complete_payment_claim_accounting_update",
    );
    expect(migration).toContain(
      "v_document.active_accounting_revision_id <> v_previous.id",
    );
    expect(migration).toContain(
      "activate_successful_accounting_revision_phase2a",
    );
    expect(migration.indexOf(
      "finalize_accounting_revision_attempt_phase2a",
    )).toBeLessThan(migration.indexOf(
      "activate_successful_accounting_revision_phase2a",
    ));
    expect(migration).toContain("record_accounting_remote_observation_phase2a");
  });

  it("makes duplicate confirmation return the same successor before blockers", () => {
    const existing = migration.indexOf(
      "revision.confirmation_preview_hash = p_input->>'previewHash'",
    );
    const activeJob = migration.indexOf(
      "Another Payment Claim accounting action is active.",
    );
    expect(existing).toBeGreaterThan(-1);
    expect(existing).toBeLessThan(activeJob);
    expect(migration).toContain(
      "'status', case\n        when v_revision.lifecycle_state = 'succeeded'",
    );
  });

  it("uses an exact-ID Xero PUT and contains no create path", () => {
    expect(worker).toContain("updateXeroSalesInvoice");
    expect(worker).toContain("getXeroInvoice");
    expect(worker).toContain("invoiceId,");
    expect(worker).toContain("verifyInitialPushXeroInvoice");
    expect(worker).not.toContain("createXeroInvoices");
    expect(worker).not.toContain("findXeroInvoicesByNumber");
  });

  it("does not require or create PDF evidence for an accounting update", () => {
    const confirmation = migration.slice(
      migration.indexOf("confirm_payment_claim_accounting_update"),
      migration.indexOf(
        "create or replace function public.get_payment_claim_accounting_update_execution",
      ),
    );
    expect(confirmation).toContain(
      "'reason', 'same_invoice_accounting_update'",
    );
    expect(confirmation).toContain("'attachments', '[]'::jsonb");
    expect(confirmation).toContain("'pdfHash', null");
    expect(confirmation).not.toContain("decode(p_input->>'pdfBase64'");
    expect(confirmation).not.toContain(
      "organization_accounting_revision_blobs",
    );
    expect(migration).not.toContain(
      "xero.payment_claim.accounting_update.attachment",
    );
  });

  it("preserves reservation-free Payment Claim number identity for updates", () => {
    expect(persistenceFix).toContain(
      "reservation_free_payment_update boolean := false",
    );
    expect(persistenceFix).toContain(
      "document.integration_contract = 'payment_claim_revision_v1'",
    );
    expect(persistenceFix).toContain(
      "p_input->>'revisionIntent' = 'direct_update'",
    );
    expect(persistenceFix).toContain(
      "p_input->>'resolutionStrategy' = 'update_existing'",
    );
    expect(persistenceFix).toContain(
      "previous_revision.number_reservation_id is null",
    );
    expect(persistenceFix).toContain(
      "p_input#>>'{payloadSnapshot,InvoiceNumber}' <> source_claim_number",
    );
    expect(persistenceFix).toContain(
      "'numberReservationId', v_previous.number_reservation_id",
    );
    expect(persistenceFix).not.toContain(
      "The existing Payment Claim invoice number is not reserved.",
    );
  });

  it("keeps reserved and reservation-free predecessor validation explicit", () => {
    expect(persistenceFix).toContain(
      "if v_previous.number_reservation_id is null then",
    );
    expect(persistenceFix).toContain(
      "v_previous.external_document_number <> v_claim_row.claim_number",
    );
    expect(persistenceFix).toContain(
      "reservation.id = v_previous.number_reservation_id",
    );
    expect(persistenceFix).toContain(
      "Payment Claim update must preserve its reservation-free claim-number identity.",
    );
  });

  it("does not add an attachment or Xero execution to the persistence fix", () => {
    expect(persistenceFix).toContain("'pdfHash', null");
    expect(persistenceFix).toContain("'attachments', '[]'::jsonb");
    expect(persistenceFix).not.toContain("xero.payment_claim.accounting_update.attachment");
    expect(persistenceFix).not.toContain("updateXeroSalesInvoice");
    expect(persistenceFix).not.toContain("createXeroInvoices");
  });

  it("classifies and logs confirmation persistence failures safely", () => {
    expect(confirmation).toContain(
      '"payment_update_confirmation_rpc_failed"',
    );
    expect(confirmation).toContain('stage: "confirmation_rpc"');
    expect(confirmation).toContain("postgresCode: result.error.code ?? null");
    expect(confirmation).toContain("proposalId: proposal.proposalId");
    expect(confirmation).toContain(
      '"payment_update_confirmation_result_invalid"',
    );
    expect(actions).toContain(
      '"TradesStack could not persist the confirmed accounting operation."',
    );
    expect(actions).toContain(
      "error.supportReference ?? supportReference",
    );
  });
});
