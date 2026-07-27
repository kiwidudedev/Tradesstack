import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260708110000_add_quote_canonicalization_foundation.sql",
);

describe("quote canonicalization foundation migration", () => {
  const sql = readFileSync(migrationPath, "utf8");

  it("adds canonical quote ownership fields and nullable pre-award project support", () => {
    expect(sql).toContain("add column if not exists originating_opportunity_id uuid null");
    expect(sql).toContain("set originating_opportunity_id = source_opportunity_id");
    expect(sql).toContain("alter table public.project_quotes");
    expect(sql).toContain("alter column project_id drop not null");
    expect(sql).toContain("alter table public.project_quote_line_items");
    expect(sql).toContain("alter column project_id drop not null");
  });

  it("adds lifecycle-aware ownership validation and indexes", () => {
    expect(sql).toContain("create index if not exists project_quotes_org_originating_opp_idx");
    expect(sql).toContain("create index if not exists project_quotes_org_project_attached_idx");
    expect(sql).toContain("create or replace function public.validate_project_quote_canonical_ownership()");
    expect(sql).toContain("Commercial quote must have either originating_opportunity_id or project_id");
    expect(sql).toContain("Project must belong to the same originating opportunity");
  });

  it("adds a canonical commercial quote save rpc", () => {
    expect(sql).toContain("create or replace function public.save_commercial_quote_draft(");
    expect(sql).toContain("p_originating_opportunity_id uuid");
    expect(sql).toContain("p_project_id uuid default null");
    expect(sql).toContain("returns table (");
    expect(sql).toContain("originating_opportunity_id uuid");
    expect(sql).toContain("project_id uuid");
    expect(sql).toContain("grant execute on function public.save_commercial_quote_draft(");
  });

  it("keeps commercial item quote links opportunity-aware for pre-award quotes", () => {
    expect(sql).toContain("create or replace function public.can_insert_commercial_item_document_link(");
    expect(sql).toContain("quote.originating_opportunity_id = item.opportunity_id");
    expect(sql).toContain("item.project_id is not distinct from quote.project_id");
    expect(sql).toContain("quote.project_id is null");
  });
});
