import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260726250000_stabilize_phase2b_voided_replacement_runtime.sql",
  ),
  "utf8",
);

describe("Phase 2B voided replacement runtime migration", () => {
  it("gives the server read-only access to immutable decision evidence", () => {
    for (const table of [
      "organization_accounting_document_revisions",
      "organization_accounting_revision_lines",
      "organization_accounting_revision_attachments",
      "organization_accounting_revision_attempts",
      "organization_accounting_events",
      "organization_accounting_remote_observations",
      "organization_accounting_projections",
    ]) {
      expect(source).toContain(table);
    }
    expect(source).toContain("grant select on");
    expect(source).toContain("to service_role");
    expect(source).not.toMatch(/grant (update|delete|truncate)/i);
  });

  it("permits only append-only server event writes", () => {
    expect(source).toContain(
      "grant insert on public.organization_accounting_events to service_role",
    );
    expect(source).not.toContain(
      "grant insert on public.organization_accounting_document_revisions",
    );
  });

  it("adds replacement and replacement attachment durable job kinds", () => {
    expect(source).toContain("'xero.payment_claim.replacement'");
    expect(source).toContain("'xero.payment_claim.replacement.attachment'");
    expect(source).toContain(
      "organization_accounting_sync_jobs_active_phase2b_revision_uidx",
    );
  });
});
