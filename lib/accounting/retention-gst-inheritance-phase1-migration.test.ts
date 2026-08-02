import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260802140000_add_retention_gst_inheritance_phase1_foundation.sql",
  "utf8",
);
const v1Source = readFileSync(
  "supabase/migrations/20260726390000_add_master_retention_date_editing.sql",
  "utf8",
);
const v1Confirmation = readFileSync(
  "supabase/migrations/20260726330000_add_master_retention_cumulative_xero_updates.sql",
  "utf8",
);
const shadow = readFileSync(
  "scripts/compare-retention-gst-inheritance-shadow.ts",
  "utf8",
);

describe("Retention GST inheritance Phase 1 migration contract", () => {
  it("adds only dormant version-two objects", () => {
    expect(migration).toContain(
      "organization_retention_release_allocation_ledger_v2",
    );
    expect(migration).toContain(
      "organization_retention_tax_classifications_v2",
    );
    expect(migration).toContain("private.master_retention_claim_source_v2");
    expect(migration).not.toContain(
      "create or replace function private.master_retention_claim_source(\n",
    );
    expect(migration).not.toContain("confirm_master_retention_claim_push");
    expect(migration).not.toContain("organization_accounting_sync_jobs");
    expect(migration).not.toContain("organization_accounting_push_proposals");
  });

  it("preserves the checked-in v1 source and confirmation contracts", () => {
    expect(v1Source).toContain(
      "create or replace function private.master_retention_claim_source(",
    );
    expect(v1Confirmation).toContain(
      "create or replace function public.confirm_master_retention_claim_push(",
    );
    expect(migration).not.toContain(v1Source);
    expect(migration).not.toContain(v1Confirmation);
  });

  it("models all approved evidence kinds and preserves exact TaxType text", () => {
    for (const evidenceKind of [
      "immutable_revision",
      "exact_legacy_adoption",
      "submission_snapshot",
      "reviewed_classification",
    ]) {
      expect(migration).toContain(`'${evidenceKind}'`);
    }
    expect(migration).toContain("tax_type = upper(tax_type)");
    expect(migration).not.toContain("hard-coded OUTPUT2");
  });

  it("uses active immutable revision identity rather than timestamp ordering", () => {
    const source = migration.slice(
      migration.indexOf("private.master_retention_claim_source_v2"),
    );
    expect(source).toContain(
      "revision.id = document.active_accounting_revision_id",
    );
    expect(source).toContain("revision.lifecycle_state = 'succeeded'");
    expect(source).not.toContain("order by revision.created_at");
    expect(source).not.toContain("organization_accounting_tax_rates tax_rate\n+      order by");
  });

  it("keeps the shadow comparison explicit, scoped, read-only, and disabled", () => {
    expect(shadow).toContain(
      'RETENTION_GST_INHERITANCE_SHADOW_ENABLED === "true"',
    );
    expect(shadow).toContain('argument("organization-id")');
    expect(shadow).toContain('argument("project-id")');
    expect(shadow).toContain('argument("claim-id")');
    expect(shadow).toContain('client.query("begin read only")');
    expect(shadow).not.toContain("createXero");
    expect(shadow).not.toContain("organization_accounting_sync_jobs");
  });
});
