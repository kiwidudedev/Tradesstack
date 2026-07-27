import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolveRetentionClaimAccountingOperation } from "./retention-claim-accounting-decision";
import { resolveRetentionClaimProposalInvoiceNumber } from "./retention-claim-proposal-identity";

const migration = readFileSync(
  "supabase/migrations/20260726370000_fix_master_retention_same_invoice_update_identity.sql",
  "utf8",
);
const proposalOperationMigration = readFileSync(
  "supabase/migrations/20260726380000_allow_same_invoice_accounting_update_proposals.sql",
  "utf8",
);
const confirmation = readFileSync(
  "lib/xero/retention-claim-push-confirmation.ts",
  "utf8",
);
const proposal = readFileSync(
  "lib/xero/retention-claim-push-proposal.ts",
  "utf8",
);
const worker = readFileSync(
  "lib/xero/retention-claim-update-worker.ts",
  "utf8",
);
const actions = readFileSync(
  "app/app/(workspace)/projects/[projectId]/preconstruction/retention/actions.ts",
  "utf8",
);

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
  activeInvoiceId: "5a21bb02-ee93-4298-813a-34a4a6a8d313",
  activeInvoiceNumber: "26028-RC-01-R2",
  replacementNumber: "26028-RC-01-R3",
  connectionMatches: true,
  tenantMatches: true,
  hasInvoiceScope: true,
  providerAvailable: true,
  providerState: "authorised" as const,
  amountPaidMinor: 0,
  amountDueMinor: 159107,
  amountCreditedMinor: 0,
  hasPayments: false,
  hasCredits: false,
  financialDivergence: false,
  contentDivergence: false,
  claimChangedAfterExport: true,
  canRefresh: true,
};

describe("one-master Retention R2 same-invoice update boundary", () => {
  it("resolves an authorised unpaid cumulative change to UPDATE_EXISTING_INVOICE", () => {
    expect(resolveRetentionClaimAccountingOperation(decisionBase)).toMatchObject({
      operation: "UPDATE_EXISTING_INVOICE",
      workerKind: "xero.retention_claim.update",
      canPush: true,
    });
  });

  it("keeps R2 and does not allocate R3 for the update proposal", () => {
    expect(resolveRetentionClaimProposalInvoiceNumber({
      operation: "UPDATE_EXISTING_INVOICE",
      claimNumber: "26028-RC-01",
      activeInvoiceNumber: "26028-RC-01-R2",
      replacementNumber: "26028-RC-01-R3",
    })).toBe("26028-RC-01-R2");
    expect(proposal).toContain(
      "activeInvoiceNumber: decision.activeRevisionInvoiceNumber",
    );
  });

  it("routes update confirmation through its stable-identity RPC", () => {
    expect(confirmation).toContain(
      '? "confirm_master_retention_claim_update"',
    );
    expect(migration).toContain(
      "create or replace function public.confirm_master_retention_claim_update",
    );
    expect(proposalOperationMigration).toContain(
      "'UPDATE_EXISTING_INVOICE'",
    );
  });

  it("extends proposal persistence without removing existing operations", () => {
    for (const operation of [
      "INITIAL_EXPORT",
      "REPLACEMENT_EXPORT",
      "UPDATE_EXISTING_INVOICE",
      "ACCOUNTING_UPDATE",
      "BLOCKED",
    ]) {
      expect(proposalOperationMigration).toContain(`'${operation}'`);
    }
  });

  it("binds the confirmed revision and job to the existing InvoiceID and number", () => {
    expect(migration).toContain(
      "v_number := v_previous.external_document_number",
    );
    expect(migration).toContain(
      "v_document.external_document_id <>",
    );
    expect(migration).toContain(
      "'externalDocumentId', v_previous.external_document_id",
    );
    expect(migration).toContain(
      "'externalDocumentNumber', v_number",
    );
  });

  it("creates only a direct-update revision, update attempt and update job", () => {
    expect(migration).toContain("'revisionIntent', 'direct_update'");
    expect(migration).toContain("'resolutionStrategy', 'update_existing'");
    expect(migration).toContain("'xero.retention_claim.update'");
    expect(migration).not.toContain("'xero.retention_claim.replacement'");
    expect(migration).not.toContain("'xero.retention_claim.initial_push'");
  });

  it("preserves the previous revision and reuses its number reservation", () => {
    expect(migration).toContain("'previousRevisionId', v_previous.id");
    expect(migration).toContain(
      "where id = v_previous.number_reservation_id",
    );
    expect(migration).toContain(
      "and formatted_number = v_number",
    );
  });

  it("requires complete cumulative origin evidence and structured lines", () => {
    expect(migration).toContain(
      "jsonb_array_length(p_input->'lines') <>",
    );
    expect(migration).toContain(
      "jsonb_array_length(v_source->'allocations')",
    );
    expect(migration).toContain(
      "'lines', p_input->'lines'",
    );
  });

  it("blocks paid, credited, divergent and stale-observation updates", () => {
    expect(migration).toContain(
      "coalesce(v_projection.amount_paid_minor, 0) <> 0",
    );
    expect(migration).toContain(
      "coalesce(v_projection.amount_credited_minor, 0) <> 0",
    );
    expect(migration).toContain("or v_projection.divergent");
    expect(migration).toContain(
      "v_observation.id <>",
    );
  });

  it("updates by exact InvoiceID and never calls a create or attachment path", () => {
    expect(worker).toContain("updateXeroSalesInvoice({");
    expect(worker).toContain("invoiceId,");
    expect(worker).not.toContain("createXeroSalesInvoice");
    expect(worker).not.toContain("executeRetentionClaimPushAttachment");
    expect(migration).toContain(
      "'required', false",
    );
  });

  it("uses structured update and panel-reload outcomes", () => {
    for (const code of [
      "RETENTION_UPDATE_REJECTED",
      "RETENTION_UPDATE_UNCERTAIN",
      "RETENTION_UPDATE_VERIFICATION_FAILED",
      "RETENTION_UPDATE_COMPLETION_FAILED",
      "RETENTION_UPDATE_RECOVERED",
    ]) {
      expect(worker).toContain(code);
    }
    expect(actions).toContain("RETENTION_PANEL_RELOAD_FAILED");
    expect(actions).toContain(
      "The existing Xero invoice was updated successfully",
    );
  });
});
