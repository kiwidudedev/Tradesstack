import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  calculateRetentionClaimPushHashes,
  type RetentionClaimRevisionLineEvidence,
} from "@/lib/xero/retention-claim-push-contract";
import {
  resolveRetentionClaimAccountingOperation,
  type RetentionClaimAccountingDecisionInput,
} from "@/lib/xero/retention-claim-accounting-decision";

const migration = readFileSync(
  "supabase/migrations/20260726390000_add_master_retention_date_editing.sql",
  "utf8",
);
const projectScopeFixMigration = readFileSync(
  "supabase/migrations/20260726400000_fix_master_retention_date_reset_project_scope.sql",
  "utf8",
);
const actions = readFileSync(
  "app/app/(workspace)/projects/[projectId]/preconstruction/retention/actions.ts",
  "utf8",
);
const editor = readFileSync(
  "components/app/RetentionClaimDateEditing.tsx",
  "utf8",
);
const panel = readFileSync(
  "components/app/RetentionClaimXeroPanel.tsx",
  "utf8",
);
const page = readFileSync(
  "app/app/(workspace)/projects/[projectId]/preconstruction/retention/claims/[retentionClaimId]/page.tsx",
  "utf8",
);
const decisionServer = readFileSync(
  "lib/xero/retention-claim-accounting-decision-server.ts",
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

function safeDecision(
  overrides: Partial<RetentionClaimAccountingDecisionInput> = {},
): RetentionClaimAccountingDecisionInput {
  return {
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
    activeInvoiceNumber: "26028-RC-01-R2",
    replacementNumber: "26028-RC-01-R3",
    connectionMatches: true,
    tenantMatches: true,
    hasInvoiceScope: true,
    providerAvailable: true,
    providerState: "authorised",
    amountPaidMinor: 0,
    amountDueMinor: 178703,
    amountCreditedMinor: 0,
    hasPayments: false,
    hasCredits: false,
    financialDivergence: false,
    contentDivergence: false,
    claimChangedAfterExport: false,
    canRefresh: true,
    ...overrides,
  };
}

const line: RetentionClaimRevisionLineEvidence = {
  sequence: 1,
  lineKind: "retention",
  sourceLineType: "payment_claim_retention",
  sourceLineId: "11111111-1111-4111-8111-111111111111",
  originatingPaymentClaimId: "11111111-1111-4111-8111-111111111111",
  description: "Retention release - Payment Claim 26028-CL-01",
  quantity: 1,
  unitAmountMinor: 152919,
  lineAmountMinor: 152919,
  taxMinor: 22938,
  totalMinor: 175857,
  accountSnapshot: { accountCode: "700" },
  taxSnapshot: { taxType: "OUTPUT2" },
  trackingSnapshot: {},
  sourceSnapshot: {},
};

function hashes(date: string, dueDate: string) {
  return calculateRetentionClaimPushHashes({
    sourceEvidence: {
      claim: { issueDate: date, dueDate },
      allocations: [{ id: line.sourceLineId }],
    },
    dependencies: {
      previousRevisionId: "revision-2",
      invoiceId: "invoice-1",
    },
    commercialSnapshot: {
      issueDate: date,
      dueDate,
      subtotalMinor: 152919,
      taxMinor: 22938,
      totalMinor: 175857,
    },
    lines: [line],
    payload: {
      Type: "ACCREC",
      Contact: { ContactID: "contact-1" },
      InvoiceNumber: "26028-RC-01-R2",
      Reference: "Test Project Alpha | Retention Claim 26028-RC-01",
      Date: date,
      DueDate: dueDate,
      CurrencyCode: "NZD",
      LineAmountTypes: "Exclusive",
      Status: "AUTHORISED",
      LineItems: [{
        Description: line.description,
        Quantity: 1,
        UnitAmount: 1529.19,
        AccountCode: "700",
        TaxType: "OUTPUT2",
      }],
    },
  });
}

describe("master Retention Claim date reset and same-invoice update", () => {
  it("uses a local reset transition with identity-only browser input", () => {
    expect(actions).toContain(
      "resetMasterRetentionClaimDatesAction(params: {\n  retentionClaimId: string;",
    );
    expect(actions).toContain(
      "updateMasterRetentionClaimDatesAction(params: {\n  retentionClaimId: string;\n  claimDate: string;\n  dueDate: string;\n  optimisticRevision: number;",
    );
    const updateAction = actions.slice(
      actions.indexOf("export async function updateMasterRetentionClaimDatesAction"),
      actions.indexOf("function immutableXeroActionError"),
    );
    expect(updateAction).not.toContain("invoiceId");
    expect(updateAction).not.toContain("invoiceNumber");
    expect(updateAction).not.toContain("operation:");
    expect(updateAction).not.toContain("tenantId");
  });

  it("unlocks only date fields and uses no modal", () => {
    expect(editor).toContain('id="master-retention-claim-date"');
    expect(editor).toContain('id="master-retention-due-date"');
    expect(editor).toContain("Save Claim");
    expect(editor).toContain("Cancel");
    expect(editor).not.toContain(
      "Reset the Retention Claim dates for editing.",
    );
    expect(editor).toContain(
      'form={MASTER_RETENTION_DATE_FORM_ID}',
    );
    expect(page).toContain("<RetentionClaimDateEditingHeaderActions />");
    expect(editor).not.toContain("<Dialog");
    expect(editor).not.toContain("allocation");
    expect(editor).not.toContain("InvoiceID");
  });

  it("renders Reset as a neutral Accounting Sync action", () => {
    expect(panel).toContain('variant="secondary"');
    expect(panel).toContain('{resetting ? "Resetting..." : "Reset"}');
    expect(panel).toContain("state.canResetDates");
    expect(panel).toContain("dateEditing?.editing ? null : state.actionLabel");
    expect(panel).not.toContain("<Dialog");
  });

  it("persists only operational dates and an append-only event", () => {
    expect(migration).toContain(
      "create or replace function public.update_master_retention_claim_dates(",
    );
    expect(migration).toContain("set issue_date = p_claim_date,");
    expect(migration).toContain("due_date = p_due_date,");
    expect(migration).toContain("draft_revision = draft_revision + 1");
    expect(migration).toContain("'master_dates_updated'");
    expect(migration).toContain("'previousClaimDate'");
    expect(migration).toContain("'previousDueDate'");
    expect(migration).toContain("'activeAccountingRevisionId'");
    expect(migration).not.toContain("delete from public.retention_claims");
  });

  it("validates master identity, optimistic revision and safe Xero state", () => {
    expect(migration).toContain("master_role = 'master_retention_claim'");
    expect(migration).not.toContain("document.project_id");
    expect(migration).toContain("revision.project_id = v_claim.project_id");
    expect(migration).toContain("v_claim.draft_revision <> p_expected_revision");
    expect(migration).toContain("p_due_date < p_claim_date");
    expect(migration).toContain("coalesce(v_projection.amount_paid_minor, 0) <> 0");
    expect(migration).toContain("coalesce(v_projection.amount_credited_minor, 0) <> 0");
    expect(migration).toContain("v_projection.divergent");
    expect(migration).toContain("v_payment_count <> 0");
    expect(migration).toContain("v_credit_count <> 0");
    expect(migration).toContain("'accounting_operation_processing'");
  });

  it("scopes the live correction through the active revision project", () => {
    expect(projectScopeFixMigration).not.toContain("document.project_id");
    expect(projectScopeFixMigration).toContain(
      "revision.project_id = v_claim.project_id",
    );
    expect(projectScopeFixMigration).toContain(
      "document.retention_claim_id = v_claim.id",
    );
  });

  it("treats identical dates as a no-op", () => {
    expect(migration).toContain("v_claim.issue_date = p_claim_date");
    expect(migration).toContain("v_claim.due_date = p_due_date");
    expect(migration).toContain("'RETENTION_DATES_UNCHANGED'");
    expect(migration).toContain("'changed', false");
  });

  it("detects dates against the active immutable revision", () => {
    expect(decisionServer).toContain("dateChangedAfterExport");
    expect(decisionServer).toContain("revisionCommercial.issueDate");
    expect(decisionServer).toContain("revisionCommercial.dueDate");
    expect(decisionServer).toContain("|| dateChangedAfterExport");
    expect(resolveRetentionClaimAccountingOperation(
      safeDecision({ claimChangedAfterExport: true }),
    ).operation).toBe("UPDATE_EXISTING_INVOICE");
    expect(resolveRetentionClaimAccountingOperation(
      safeDecision(),
    ).operation).toBe("BLOCKED");
  });

  it("changes accounting hashes for dates without changing lines or totals", () => {
    const previous = hashes("2026-07-25", "2026-07-25");
    const current = hashes("2026-07-31", "2026-08-07");
    expect(current.sourceEvidenceHash).not.toBe(previous.sourceEvidenceHash);
    expect(current.commercialHash).not.toBe(previous.commercialHash);
    expect(current.payloadHash).not.toBe(previous.payloadHash);
    expect(current.previewHash).not.toBe(previous.previewHash);
    expect(current.linesHash).toBe(previous.linesHash);
  });

  it("preserves previous and proposed dates in the proposal", () => {
    expect(proposal).toContain("previousInvoiceDate:");
    expect(proposal).toContain("previousDueDate:");
    expect(proposal).toContain("invoiceDate: payload.Date");
    expect(proposal).toContain("dueDate: payload.DueDate");
    expect(proposal).toContain(
      "activeInvoiceNumber: decision.activeRevisionInvoiceNumber",
    );
  });

  it("updates and verifies the same exact Xero invoice", () => {
    expect(worker).toContain("updateXeroSalesInvoice({");
    expect(worker).toContain("invoiceId,");
    expect(worker).toContain(
      "proposedPayload.InvoiceNumber !== invoiceNumber",
    );
    expect(worker).toContain(
      'text(authoritative as Row, "InvoiceID", "invoiceID") !== invoiceId',
    );
    expect(worker).toContain(
      'text(authoritative as Row, "InvoiceNumber", "invoiceNumber")',
    );
    expect(worker).not.toContain("createXeroSalesInvoice");
  });

  it("keeps update recovery on the same InvoiceID", () => {
    expect(worker).toContain(
      "worker never searches by number and never creates an invoice",
    );
    expect(worker).toContain("getXeroInvoice(");
    expect(worker).toContain("RETENTION_UPDATE_UNCERTAIN");
    expect(worker).toContain("RETENTION_UPDATE_RECOVERED");
  });
});
