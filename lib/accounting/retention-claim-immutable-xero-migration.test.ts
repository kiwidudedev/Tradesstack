import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const path = join(
  process.cwd(),
  "supabase/migrations/20260726300000_add_retention_claim_immutable_xero_phase2c.sql",
);
const sql = readFileSync(path, "utf8");

describe("Retention Claim immutable Xero Phase 2C migration", () => {
  it("is opt-in at organisation level and preserves Payment Claim gate shape", () => {
    expect(sql).toContain(
      "retention_claim_immutable_xero_enabled boolean not null default false",
    );
    expect(sql).toContain("not initial_payment_claim_push_enabled");
    expect(sql).toContain("not retention_claim_immutable_xero_enabled");
    expect(sql).not.toMatch(
      /retention_claim_immutable_xero_enabled\s*=\s*true/i,
    );
  });

  it("creates one stable document per Retention Claim independent of tenant", () => {
    expect(sql).toContain(
      "organization_accounting_documents_stable_retention_claim_uidx",
    );
    expect(sql).toContain(
      "organization_id, provider, retention_claim_id",
    );
    expect(sql).toContain(
      "where local_document_type = 'retention_claim'",
    );
  });

  it("enforces organisation-wide commercial Retention Claim identity", () => {
    expect(sql).toContain(
      "retention_claims_organization_claim_number_uidx",
    );
    expect(sql).toContain(
      "on public.retention_claims(organization_id, claim_number)",
    );
  });

  it("adds isolated initial, replacement and attachment job kinds", () => {
    for (const kind of [
      "xero.retention_claim.initial_push",
      "xero.retention_claim.initial_push.attachment",
      "xero.retention_claim.replacement",
      "xero.retention_claim.replacement.attachment",
    ]) {
      expect(sql).toContain(`'${kind}'`);
    }
  });

  it("keeps proposals and confirmation service-only", () => {
    expect(sql).toContain(
      "public.persist_retention_claim_push_proposal_phase2c",
    );
    expect(sql).toContain("public.confirm_retention_claim_push_phase2c");
    expect(sql).toContain(
      "Historical Retention Claim adoption is server-only.",
    );
    expect(sql).toContain("to service_role");
    expect(sql).toContain("from public, anon, authenticated");
  });

  it("uses timestamp semantics for confirmation and adoption", () => {
    expect(sql.match(
      /submitted_at is distinct from\s+\(p_input->>'sourceOptimisticRevision'\)::timestamptz/g,
    )).toHaveLength(2);
    expect(sql).not.toContain(
      "submitted_at::text <> p_input->>'sourceOptimisticRevision'",
    );
  });

  it("revalidates authoritative Retention ownership atomically", () => {
    expect(sql.match(/evaluate_retention_ownership_phase2a/g)?.length).toBeGreaterThanOrEqual(2);
    expect(sql).toContain("Retention Claim allocation ownership changed.");
    expect(sql).toContain("pg_advisory_xact_lock");
  });

  it("persists exact immutable lines, PDF bytes, attempt and durable job", () => {
    expect(sql).toContain("persist_confirmed_accounting_revision_phase2a");
    expect(sql).toContain("organization_accounting_revision_blobs");
    expect(sql).toContain("create_accounting_revision_attempt_phase2a");
    expect(sql).toContain("organization_accounting_sync_jobs");
    expect(sql).toContain("Confirmed Retention Claim PDF evidence is invalid.");
  });

  it("creates only ACCREC AUTHORISED revision evidence", () => {
    expect(sql).toContain("v_payload->>'Type' <> 'ACCREC'");
    expect(sql).toContain("v_payload->>'Status' <> 'AUTHORISED'");
    expect(sql).toContain("'providerDocumentType', 'ACCREC'");
    expect(sql).toContain("'requestedProviderStatus', 'AUTHORISED'");
    expect(sql).not.toContain("'DRAFT'");
  });

  it("derives replacement numbers from the commercial Retention Claim number", () => {
    expect(sql).toContain(
      "v_number := v_claim_row.claim_number || '-R' || v_replacement_sequence",
    );
    expect(sql).toContain("v_number := v_claim_row.claim_number");
    expect(sql).not.toMatch(/v_number\s*:=\s*'TSI-/);
  });

  it("does not supersede the predecessor during confirmation", () => {
    const confirmation = sql.slice(
      sql.indexOf("create or replace function public.confirm_retention_claim_push_phase2c"),
      sql.indexOf("create or replace function public.complete_retention_claim_push_phase2c"),
    );
    expect(confirmation).not.toContain("superseded_by_revision_id");
    expect(confirmation).not.toContain("activate_successful_accounting_revision_phase2a");
  });

  it("activates only after worker verification and queues attachment separately", () => {
    const complete = sql.slice(
      sql.indexOf("create or replace function public.complete_retention_claim_push_phase2c"),
      sql.indexOf("create or replace function public.get_retention_claim_push_execution_phase2c"),
    );
    expect(complete).toContain("finalize_accounting_revision_attempt_phase2a");
    expect(complete).toContain("activate_successful_accounting_revision_phase2a");
    expect(complete).toContain("record_accounting_remote_observation_phase2a");
    expect(complete).toContain("xero.retention_claim.initial_push.attachment");
    expect(complete).toContain("xero.retention_claim.replacement.attachment");
  });

  it("preserves legacy identity without fabricating a PDF or creating a job", () => {
    const adoption = sql.slice(
      sql.indexOf("create or replace function public.adopt_legacy_voided_retention_claim_phase2c"),
      sql.indexOf("create or replace function public.queue_retention_claim_attachment_retry_phase2c"),
    );
    expect(adoption).toContain("'legacy_import'");
    expect(adoption).toContain("'legacy_preservation'");
    expect(adoption).toContain("'historicalPdfFabricated', false");
    expect(adoption).toContain("'xeroPostPerformed', false");
    expect(adoption).not.toContain("organization_accounting_sync_jobs");
    expect(adoption).not.toContain("organization_accounting_revision_attachments");
  });

  it("retries only the failed immutable PDF for the active successful revision", () => {
    const retry = sql.slice(
      sql.indexOf("create or replace function public.queue_retention_claim_attachment_retry_phase2c"),
      sql.indexOf("revoke all on function"),
    );
    expect(retry).toContain("active_accounting_revision_id = v_revision.id");
    expect(retry).toContain("v_attachment.upload_state <> 'failed'");
    expect(retry).toContain("attempt_intent = 'attach'");
    expect(retry).toContain("'user_retry'");
    expect(retry).not.toContain("xero.retention_claim.initial_push'");
    expect(retry).not.toContain("createXeroInvoices");
  });
});
