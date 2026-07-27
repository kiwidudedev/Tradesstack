import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260726360000_fix_master_retention_voided_replacement.sql",
  ),
  "utf8",
);
const confirmation = readFileSync(
  join(process.cwd(), "lib/xero/retention-claim-push-confirmation.ts"),
  "utf8",
);
const worker = readFileSync(
  join(process.cwd(), "lib/xero/retention-claim-push-worker.ts"),
  "utf8",
);
const actions = readFileSync(
  join(
    process.cwd(),
    "app/app/(workspace)/projects/[projectId]/preconstruction/retention/actions.ts",
  ),
  "utf8",
);

describe("master Retention voided replacement boundary", () => {
  it("routes replacement confirmation away from the legacy PDF RPC", () => {
    expect(confirmation).toContain(
      '"confirm_master_retention_claim_replacement"',
    );
    expect(confirmation).not.toContain(
      '? "confirm_retention_claim_push_phase2c"',
    );
  });

  it("refreshes stale provider evidence before building a new proposal", () => {
    const loadStart = actions.indexOf(
      "async function prepareRetentionClaimPushProposal",
    );
    const confirmStart = actions.indexOf(
      "export async function loadRetentionClaimPushProposalAction",
    );
    const loadAction = actions.slice(loadStart, confirmStart);
    expect(actions).toContain(
      "async function refreshRetentionClaimEvidenceIfStale",
    );
    expect(actions).toContain("retention-claim-preview-refresh-");
    expect(loadAction.indexOf("refreshRetentionClaimEvidenceIfStale")).toBeLessThan(
      loadAction.indexOf("buildRetentionClaimPushProposal"),
    );
  });

  it("revalidates the cumulative master and exact voided predecessor", () => {
    expect(migration).toContain("private.master_retention_claim_source");
    expect(migration).toContain(
      "'RETENTION_MASTER_CHANGED: New Payment Claim retention appeared after preview.'",
    );
    expect(migration).toContain(
      "id = (p_input->>'previousObservationId')::uuid",
    );
    expect(migration).toContain(
      "normalized_invoice_status not in ('voided', 'deleted')",
    );
    expect(migration).toContain(
      "coalesce(v_projection.amount_paid_minor, 0) <> 0",
    );
    expect(migration).toContain(
      "coalesce(v_projection.amount_credited_minor, 0) <> 0",
    );
    expect(migration).toContain("v_projection.divergent");
    expect(migration).toContain("raw_observation->'Payments'");
    expect(migration).toContain("raw_observation->'CreditNotes'");
  });

  it("derives and reserves RC-01-Rn from the commercial master", () => {
    expect(migration).toContain(
      "v_number := v_claim_row.claim_number || '-R' || v_replacement_sequence",
    );
    expect(migration).toContain(
      "perform pg_advisory_xact_lock(hashtextextended(v_claim::text, 2636))",
    );
    expect(migration).toContain(
      "'retention_claim', v_claim, 'replacement', v_actor",
    );
    expect(migration).not.toContain("RC-02");
  });

  it("persists one structured replacement revision, attempt and job without attachments", () => {
    expect(migration).toContain("'revisionIntent', 'replacement'");
    expect(migration).toContain("'resolutionStrategy', 'replacement'");
    expect(migration).toContain("'attachments', '[]'::jsonb");
    expect(migration).toContain("'required', false");
    expect(migration).toContain("'structured_only'");
    expect(migration).toContain("'replace'");
    expect(migration).toContain("'xero.retention_claim.replacement'");
    expect(migration).not.toContain("pdfBase64");
    expect(migration).not.toContain("pdfByteSize");
    expect(migration).not.toContain(
      "organization_accounting_revision_attachments",
    );
    expect(migration).not.toContain(
      "organization_accounting_revision_blobs",
    );
  });

  it("makes repeated confirmation reuse the same durable identities", () => {
    expect(migration).toContain(
      "revision.confirmation_preview_hash = p_input->>'previewHash'",
    );
    expect(migration).toContain(
      "attempt.attempt_intent = 'replace'",
    );
    expect(migration).toContain(
      "job.job_kind = 'xero.retention_claim.replacement'",
    );
    expect(migration).toContain("'accountingRevisionId', v_revision.id");
    expect(migration).toContain("'attemptId', v_attempt.id");
    expect(migration).toContain("'jobId', v_job_id");
  });

  it("keeps create execution search-before-create and attachment-free", () => {
    expect(worker).toContain('if (intent === "replacement")');
    expect(worker).toContain("predecessorIsSafelyVoided");
    expect(worker).toContain("findXeroInvoicesByNumber");
    expect(worker).toContain("createXeroInvoices");
    expect(worker).toContain(
      'execution.attachment\n      ? "complete_retention_claim_push_phase2c"\n      : "complete_master_retention_claim_push"',
    );
  });

  it("activates a distinct replacement InvoiceID and preserves predecessor lineage", () => {
    expect(migration).toContain(
      "v_revision.revision_intent not in (\n      'initial_push', 'direct_update', 'replacement'",
    );
    expect(migration).toContain(
      "p_result->>'externalDocumentId' = v_previous.external_document_id",
    );
    expect(migration).toContain(
      "v_revision.previous_revision_id",
    );
    expect(migration).toContain(
      "activate_successful_accounting_revision_phase2a",
    );
  });
});
