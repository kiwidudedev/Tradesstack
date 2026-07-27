import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/20260725140000_harden_immutable_accounting_foundation_phase2a.sql",
  "utf8",
);

describe("Phase 2A post-deployment hardening migration", () => {
  it("enforces source project, document chain, tenant, and reservation identity", () => {
    expect(sql).toContain("enforce_phase2a_revision_identity");
    expect(sql).toContain(
      "Accounting revision project does not match its source claim.",
    );
    expect(sql).toContain(
      "Accounting revision predecessor must be the prior revision of the same document.",
    );
    expect(sql).toContain(
      "Accounting revision number reservation does not match its tenant and document.",
    );
    expect(sql).toContain("before insert on public.organization_accounting_document_revisions");
  });

  it("requires the latest invoice attempt for activation", () => {
    expect(sql).toContain(
      "a.attempt_intent in ('create', 'update', 'amend', 'credit', 'void', 'replace')",
    );
    expect(sql).toContain(
      "Only the latest successful invoice attempt can activate a revision.",
    );
    expect(sql).not.toMatch(
      /attempt_intent\s+in\s+\([^)]*'attach'/,
    );
  });

  it("allows current projections only for the active successful revision", () => {
    expect(sql).toContain("d.active_accounting_revision_id = r.id");
    expect(sql).toContain(
      "Remote observation revision is not active for its accounting document.",
    );
    expect(sql).toContain("revision.lifecycle_state <> 'succeeded'");
  });

  it("keeps the correction dormant and production-compatible", () => {
    expect(sql).not.toMatch(/alter table public\.project_claims/i);
    expect(sql).not.toMatch(/alter table public\.retention_claims/i);
    expect(sql).not.toMatch(/organization_accounting_sync_jobs\s+(?:insert|update|delete)/i);
    expect(sql).not.toMatch(/xero\.sales_invoice\.(?:sync|refresh)/i);
    expect(sql).not.toMatch(/create policy[^;]+project_claims/i);
  });

  it("adds a service-only metadata diagnostic without exposing secrets", () => {
    expect(sql).toContain("get_accounting_phase2a_health");
    expect(sql).toContain("set search_path = public, pg_catalog");
    expect(sql).toMatch(
      /revoke all on function[\s\S]*get_accounting_phase2a_health\(\)[\s\S]*from public, anon, authenticated/i,
    );
    expect(sql).toMatch(
      /grant execute on function[\s\S]*get_accounting_phase2a_health\(\)[\s\S]*to service_role/i,
    );
    expect(sql).not.toMatch(/encrypted_token|oauth_states|connection_secrets/i);
  });
});
