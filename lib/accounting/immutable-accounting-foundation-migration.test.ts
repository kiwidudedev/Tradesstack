import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/20260725130000_add_immutable_accounting_foundation_phase2a.sql",
  "utf8",
);

describe("Phase 2A immutable accounting foundation migration", () => {
  it("extends the existing stable document with nullable evidence pointers", () => {
    expect(sql).toContain("alter table public.organization_accounting_documents");
    expect(sql).toContain("add column active_accounting_revision_id uuid null");
    expect(sql).toContain("add column current_accounting_projection_id uuid null");
    expect(sql).toContain("add column current_legacy_classification_id uuid null");
    expect(sql).not.toMatch(/create table public\.organization_accounting_documents/i);
  });

  it("models reusable confirmed revisions and immutable line evidence", () => {
    expect(sql).toContain("organization_accounting_document_revisions");
    expect(sql).toContain("organization_accounting_revision_lines");
    expect(sql).toContain("revision_intent text not null");
    expect(sql).toContain("previous_revision_id uuid null");
    expect(sql).toContain("source_evidence_hash text not null");
    expect(sql).toContain("provider_content_hash text not null");
    expect(sql).toContain("confirmation_preview_hash text not null");
    expect(sql).toContain("confirmed_by uuid not null");
    expect(sql).toContain("confirmed_at timestamptz not null");
    expect(sql).toContain("Confirmed accounting revision evidence is immutable.");
    expect(sql).toContain("reject_accounting_revision_line_mutation");
  });

  it("locks Xero sales-invoice revisions to ACCREC and AUTHORISED", () => {
    expect(sql).toContain("provider_document_type = 'ACCREC'");
    expect(sql).toContain("requested_provider_status = 'AUTHORISED'");
    expect(sql).not.toMatch(/requested_provider_status\s*=\s*'DRAFT'/);
    expect(sql).not.toMatch(/requested_provider_status\s+text[^;]*default\s+'DRAFT'/s);
  });

  it("persists only server-confirmed reconciled evidence", () => {
    expect(sql).toContain("persist_confirmed_accounting_revision_phase2a");
    expect(sql).toContain("Confirmed accounting identity does not match");
    expect(sql).toContain("Confirmed accounting line totals do not reconcile.");
    expect(sql).toContain("confirmationPreviewHash");
    expect(sql).toContain("'revision_confirmed'");
    expect(sql).toMatch(
      /revoke all on function[\s\S]*persist_confirmed_accounting_revision_phase2a[\s\S]*from public, anon, authenticated/i,
    );
    expect(sql).toMatch(
      /grant execute on function[\s\S]*persist_confirmed_accounting_revision_phase2a[\s\S]*to service_role/i,
    );
  });

  it("reserves one shared tenant sequence for both claim types", () => {
    expect(sql).toContain("organization_accounting_number_counters");
    expect(sql).toContain("organization_accounting_number_reservations");
    expect(sql).toContain("document_class = 'sales_invoice'");
    expect(sql).toContain("('project_claim', 'retention_claim')");
    expect(sql).toContain("'TSI-' || lpad(next_sequence::text, 8, '0')");
    expect(sql).toContain("accounting_number_reservation_sequence_unique");
    expect(sql).toContain("reject_accounting_number_reservation_mutation");
  });

  it("provides lease-token attempts without modifying the current job table", () => {
    expect(sql).toContain("organization_accounting_revision_attempts");
    expect(sql).toContain("for update skip locked");
    expect(sql).toContain("lease_token = gen_random_uuid()");
    expect(sql).toContain("and lease_token = p_lease_token");
    expect(sql).toContain("and lease_expires_at >= now()");
    expect(sql).toContain("accounting_revision_attempt_one_active_uidx");
    expect(sql).not.toMatch(/alter table public\.organization_accounting_sync_jobs/i);
    expect(sql).not.toMatch(/update public\.organization_accounting_sync_jobs/i);
  });

  it("activates only successful revisions and supersedes atomically", () => {
    expect(sql).toContain("activate_successful_accounting_revision_phase2a");
    expect(sql).toContain("a.queue_state = 'succeeded'");
    expect(sql).toContain("Only a successfully evidenced revision can become active.");
    expect(sql).toContain("active_accounting_revision_id = revision.id");
    expect(sql).toContain("superseded_by_revision_id = revision.id");
  });

  it("keeps events, observations, attachments, projections, and legacy evidence separate", () => {
    expect(sql).toContain("organization_accounting_revision_attachments");
    expect(sql).toContain("organization_accounting_events");
    expect(sql).toContain("organization_accounting_remote_observations");
    expect(sql).toContain("content_hash text not null");
    expect(sql).toContain("settlement_hash text not null");
    expect(sql).toContain("organization_accounting_projections");
    expect(sql).toContain("organization_accounting_legacy_classifications");
    expect(sql).toContain("reject_accounting_observation_mutation");
    expect(sql).toContain("reject_accounting_legacy_classification_mutation");
  });

  it("provides read-only retention ownership diagnostics without Payment Schedules", () => {
    expect(sql).toContain("evaluate_retention_ownership_phase2a");
    expect(sql).toContain("private.retention_eligibility_state");
    expect(sql).toContain("public.get_project_retention_position_summary");
    expect(sql).toContain("nativeSubmittedMinor");
    expect(sql).toContain("approvedLegacyMinor");
    expect(sql).toContain("draftCommittedMinor");
    expect(sql).toContain("exportedMinor");
    expect(sql).toContain("paidMinor");
    expect(sql).toContain("scheduleEligibleMinor");
    expect(sql).toContain("duplicate_release_path");
    expect(sql).not.toMatch(/payment_schedule/i);
  });

  it("forces RLS and denies authenticated mutations", () => {
    const forceRlsCount = sql.match(/force row level security/g)?.length ?? 0;
    expect(forceRlsCount).toBeGreaterThanOrEqual(10);
    expect(sql).toMatch(
      /revoke all on[\s\S]*organization_accounting_document_revisions[\s\S]*from public, anon, authenticated, service_role/i,
    );
    expect(sql).not.toMatch(
      /grant\s+(?:insert|update|delete)[^;]*\s+to authenticated/i,
    );
  });

  it("is dormant with respect to current Xero and operational claim behavior", () => {
    expect(sql).not.toMatch(/alter table public\.project_claims/i);
    expect(sql).not.toMatch(/alter table public\.retention_claims/i);
    expect(sql).not.toMatch(/update public\.project_claims/i);
    expect(sql).not.toMatch(/update public\.retention_claims/i);
    expect(sql).not.toMatch(/create policy[^;]+on public\.project_claims/i);
    expect(sql).not.toMatch(/create policy[^;]+on public\.retention_claims/i);
    expect(sql).not.toMatch(/xero\.sales_invoice\.(?:sync|refresh)/i);
  });
});
