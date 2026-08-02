import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260802130000_allow_zero_tax_retention_revision_lines.sql",
  ),
  "utf8",
);

describe("zero-tax retention revision-line migration", () => {
  it("changes only the shared amount constraint", () => {
    expect(migration).toContain(
      "drop constraint accounting_revision_line_amounts_check",
    );
    expect(migration).toContain(
      "add constraint accounting_revision_line_amounts_check check",
    );
    expect(migration.match(/alter table/g)).toHaveLength(2);
    expect(migration).not.toContain("organization_accounting_sync_jobs");
    expect(migration).not.toContain("organization_accounting_documents");
    expect(migration).not.toContain("organization_accounting_document_revisions");
    expect(migration).not.toContain("organization_accounting_number_reservations");
  });

  it("allows zero tax only for a non-zero retention amount", () => {
    expect(migration).toContain("line_kind = 'retention'");
    expect(migration).toContain("line_amount_minor <> 0");
    expect(migration).toContain("tax_minor = 0");
    expect(migration).toContain(
      "sign(line_amount_minor) = sign(tax_minor)",
    );
    expect(migration).toContain(
      "total_minor = line_amount_minor + tax_minor",
    );
  });

  it("preserves the prior non-retention and quantity rules", () => {
    expect(migration).toContain("quantity >= 0");
    expect(migration).toContain(
      "line_kind <> 'retention' and line_amount_minor >= 0 and tax_minor >= 0",
    );
  });
});
