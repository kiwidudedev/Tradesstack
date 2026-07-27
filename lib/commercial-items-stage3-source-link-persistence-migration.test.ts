import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("commercial items source-link persistence migration", () => {
  const migrationPath = join(
    process.cwd(),
    "supabase/migrations/20260708074500_fix_quote_source_link_persistence.sql",
  );
  const sql = readFileSync(migrationPath, "utf8");

  it("adds a quote lineage repair rpc for quote-link persistence", () => {
    expect(sql).toContain("create or replace function public.repair_project_quote_source_opportunity_lineage(");
    expect(sql).toContain("returns table (");
    expect(sql).toContain("grant execute on function public.repair_project_quote_source_opportunity_lineage(uuid, uuid) to authenticated;");
    expect(sql).toContain("raise exception 'This quote belongs to a different opportunity.';");
  });

  it("backfills safe null-lineage quotes from project source opportunity lineage", () => {
    expect(sql).toContain("with safely_repairable_quotes as (");
    expect(sql).toContain("join public.organization_projects project");
    expect(sql).toContain("join public.organization_opportunities opportunity");
    expect(sql).toContain("q.source_opportunity_id is null");
    expect(sql).toContain("project.source_opportunity_id is not null");
    expect(sql).toContain("other_opportunity.workspace_project_id = q.project_id");
    expect(sql).toContain("set source_opportunity_id = candidate.source_opportunity_id");
  });
});
