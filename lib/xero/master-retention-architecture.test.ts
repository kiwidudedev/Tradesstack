import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("one-project one-master Retention architecture", () => {
  const migration = source(
    "supabase/migrations/"
      + "20260726330000_add_master_retention_cumulative_xero_updates.sql",
  );
  const initializationMigration = source(
    "supabase/migrations/"
      + "20260726340000_initialize_master_retention_claim_from_payment_claims.sql",
  );
  const compatibilityMigration = source(
    "supabase/migrations/"
      + "20260726350000_promote_unambiguous_rc01_master_retention_claims.sql",
  );
  const updateWorker = source(
    "lib/xero/retention-claim-update-worker.ts",
  );
  const actions = source(
    "app/app/(workspace)/projects/[projectId]/preconstruction/"
      + "retention/actions.ts",
  );
  const panel = source("components/app/RetentionClaimXeroPanel.tsx");
  const workspace = source(
    "app/app/(workspace)/projects/[projectId]/preconstruction/"
      + "claims/RetentionWorkspaceSection.tsx",
  );
  const detail = source(
    "app/app/(workspace)/projects/[projectId]/preconstruction/"
      + "retention/claims/[retentionClaimId]/page.tsx",
  );

  it("enforces one master per organisation and project", () => {
    expect(migration).toContain(
      "retention_claims_one_master_per_project_uidx",
    );
    expect(migration).toContain(
      "on public.retention_claims(organization_id, project_id)",
    );
    expect(migration).toContain(
      "where master_role = 'master_retention_claim'",
    );
    expect(migration).toContain("'obsolete_automatic_draft'");
  });

  it("initializes RC-01 once from submitted Payment Claim retention", () => {
    expect(initializationMigration).toContain(
      "private.ensure_master_retention_claim",
    );
    expect(initializationMigration).toContain(
      "project_claims_master_retention_initialization",
    );
    expect(initializationMigration).toContain(
      "new.status = 'Submitted'",
    );
    expect(initializationMigration).toContain(
      "v_claim_number !~ '-RC-01$'",
    );
    expect(initializationMigration).toContain(
      "master_requires_submitted_payment_claim",
    );
    expect(initializationMigration).not.toContain(
      "'obsolete_automatic_draft'",
    );
  });

  it("promotes only an unambiguous historical submitted RC-01", () => {
    expect(compatibilityMigration).toContain(
      "claim.claim_number ~ '-RC-01$'",
    );
    expect(compatibilityMigration).toContain(
      "submitted_claim.status = 'submitted'",
    );
    expect(compatibilityMigration).toContain(") = 1");
    expect(compatibilityMigration).not.toContain(
      "organization_accounting_document_revisions",
    );
    expect(compatibilityMigration).not.toContain(
      "retention_claim_allocations",
    );
  });

  it("builds the master position only from submitted Payment Claims", () => {
    expect(migration).toContain(
      "private.master_retention_claim_source",
    );
    expect(migration).toContain(
      "payment_claim.status = 'Submitted'",
    );
    expect(migration).toContain(
      "payment_claim.retention_withheld_amount",
    );
    expect(migration).not.toContain(
      "insert into public.retention_claim_allocations",
    );
  });

  it("confirms structured revisions with no PDF or attachment rows", () => {
    const confirmation = migration.slice(
      migration.indexOf(
        "create or replace function public.confirm_master_retention_claim_push",
      ),
      migration.indexOf(
        "create or replace function public.get_master_retention_claim_execution",
      ),
    );
    expect(confirmation).toContain("'attachments', '[]'::jsonb");
    expect(confirmation).toContain("'required', false");
    expect(confirmation).toContain("'direct_update'");
    expect(confirmation).toContain("'update_existing'");
    expect(confirmation).toContain("'xero.retention_claim.update'");
    expect(confirmation).not.toContain("pdfBase64");
    expect(confirmation).not.toContain(
      "organization_accounting_revision_attachments",
    );
    expect(confirmation).not.toContain(
      "organization_accounting_revision_blobs",
    );
  });

  it("uses a dedicated same-InvoiceID update worker with no create path", () => {
    expect(updateWorker).toContain("updateXeroSalesInvoice");
    expect(updateWorker).toContain("getXeroInvoice");
    expect(updateWorker).toContain(
      "document.active_accounting_revision_id !== previous.id",
    );
    expect(updateWorker).toContain(
      "externalDocumentId: invoiceId",
    );
    expect(updateWorker).not.toContain("createXeroInvoices");
    expect(updateWorker).not.toContain("findXeroInvoicesByNumber");
    expect(updateWorker).not.toContain("putXeroInvoiceAttachment");
    expect(updateWorker).not.toContain("pdfBase64");
  });

  it("does not generate or run an attachment after master confirmation", () => {
    const loadStart = actions.indexOf(
      "async function prepareRetentionClaimPushProposal",
    );
    const confirmStart = actions.indexOf(
      "async function confirmRetentionClaimPushPrepared",
    );
    const refreshStart = actions.indexOf(
      "export async function refreshRetentionClaimXeroAction",
    );
    const loadAction = actions.slice(loadStart, confirmStart);
    const confirmAction = actions.slice(confirmStart, refreshStart);
    expect(loadAction).not.toContain(
      "generateRetentionClaimPreviewDocument",
    );
    expect(confirmAction).not.toContain("attachmentJob");
    expect(confirmAction).not.toContain(".attachment");
  });

  it("removes multiple-claim and PDF controls from the master UI", () => {
    expect(workspace).not.toContain("New Retention Claim");
    expect(workspace).toContain("Pushed to Xero");
    expect(workspace).toContain("New Since Last Push");
    expect(detail).not.toContain("Retention Claim Document");
    expect(detail).not.toContain("Download PDF");
    expect(panel).not.toContain("PDF filename");
    expect(panel).not.toContain("Retry PDF attachment");
    expect(panel).not.toContain("Existing InvoiceID");
    expect(panel).not.toContain("Current Xero subtotal");
    expect(panel).not.toContain("<Dialog");
    expect(panel).toContain("pushRetentionClaimToXeroAction");
  });
});
