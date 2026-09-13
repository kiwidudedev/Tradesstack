import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  new URL("../supabase/migrations/20260819120000_add_opportunity_award_pricing_foundation.sql", import.meta.url),
  "utf8",
);

describe("Opportunity award pricing foundation migration", () => {
  it("adds explicit quote revision lineage without parsing quote numbers", () => {
    expect(sql).toContain("predecessor_quote_id uuid null");
    expect(sql).toContain("revision_number integer not null default 1");
    expect(sql).toContain("project_quotes_org_predecessor_fkey");
    expect(sql).toContain("project_quotes_one_successor_per_revision_idx");
    expect(sql).not.toMatch(/split_part\s*\(\s*quote_number/i);
  });

  it("adds tenant-safe manifest, source, and quote-line evidence", () => {
    expect(sql).toContain("create table public.opportunity_award_pricing_manifests");
    expect(sql).toContain("create table public.opportunity_award_pricing_manifest_sources");
    expect(sql).toContain("create table public.opportunity_award_pricing_manifest_lines");
    expect(sql).toContain("foreign key (organization_id, accepted_quote_id)");
    expect(sql).toContain("foreign key (organization_id, source_workbook_id)");
    expect(sql).toContain("foreign key (organization_id, source_workbook_id, source_sheet_id)");
  });

  it("supports multiple source workbooks and explicit manual lines", () => {
    expect(sql).toContain("source_kind in ('worksheet', 'manual')");
    expect(sql).toContain("pricing_source_kind in ('worksheet', 'manual', 'unresolved')");
    expect(sql).toContain("source_workbook_count integer not null default 0");
    expect(sql).not.toContain("unique (accepted_quote_id, source_workbook_id)");
  });

  it("locks awarded quotes, their lines, tender workbooks, sheets, and material evidence", () => {
    expect(sql).toContain("reject_award_locked_quote_mutation");
    expect(sql).toContain("reject_award_locked_quote_line_mutation");
    expect(sql).toContain("reject_award_locked_workbook_mutation");
    expect(sql).toContain("reject_award_locked_workbook_sheet_mutation");
    expect(sql).toContain("reject_award_locked_workbook_material_binding_mutation");
  });

  it("makes award evidence read-only to authenticated clients", () => {
    expect(sql).toContain("force row level security");
    expect(sql).toContain("revoke all on public.opportunity_award_pricing_manifests from public, anon, authenticated");
    expect(sql).toContain("grant select on public.opportunity_award_pricing_manifests to authenticated");
    expect(sql).not.toMatch(/grant\s+(insert|update|delete).*opportunity_award_pricing_manifests/i);
  });
});
