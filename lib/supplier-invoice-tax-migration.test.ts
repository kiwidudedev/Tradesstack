import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260721194500_add_jurisdiction_aware_supplier_invoice_tax_resolution.sql",
  "utf8",
);

describe("jurisdiction-aware Supplier Invoice tax migration", () => {
  it("keeps tax rates scoped to the connected tenant and expense use", () => {
    expect(migration).toContain("connection.tenant_id = rate.tenant_id");
    expect(migration).toContain("rate.can_apply_to_expenses = true");
    expect(migration).toContain("rate.jurisdiction_code = v_jurisdiction");
  });

  it("preserves captured line tax evidence", () => {
    expect(migration).toContain("tax_amount, cost_code_id");
    expect(migration).toContain("'taxEvidenceSource'");
    expect(migration).toContain("source_metadata_json");
  });

  it("provides dry-run, finance-hash, export and lock guards for repair", () => {
    expect(migration).toContain("p_dry_run boolean default true");
    expect(migration).toContain("supplier_invoice_finance_version_hash");
    expect(migration).toContain("export_status in ('queued', 'exporting', 'exported', 'attention_required')");
    expect(migration).toContain("e.event_status = 'active'");
  });
});
