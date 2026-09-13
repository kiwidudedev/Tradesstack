import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/20260822150000_replace_master_quote_with_primary_client_source.sql", import.meta.url),
  "utf8",
);
const numberAllocationFix = readFileSync(
  new URL("../supabase/migrations/20260823143000_fix_opportunity_quote_number_allocation.sql", import.meta.url),
  "utf8",
);

describe("Primary Client quote distribution migration", () => {
  it("keeps internal numbering unique and introduces a shared display reference", () => {
    expect(migration).toContain("display_reference text");
    expect(migration).toContain("base_quote_number");
    expect(migration).not.toContain("drop constraint project_quotes_organization_id_quote_number_key");
  });

  it("fails closed for different meaningful Master and Primary quote states", () => {
    expect(migration).toContain("opportunity_quote_has_meaningful_state_v1");
    expect(migration).toContain("Ambiguous Master and Primary Client quote state");
    expect(migration).toContain("opportunity_quote_snapshot_hash_v1");
  });

  it("adopts a safe Master record without replacing Quote Series or revisions", () => {
    expect(migration).toContain("set is_master_quote = false");
    expect(migration).toContain("quote_series_id = created_series.id");
    expect(migration).toContain("set current_revision_id = master.id");
    expect(migration).not.toContain("drop table public.opportunity_quote_series");
  });

  it("clones from the exact current Primary Client revision with generic provenance", () => {
    expect(migration).toContain("distribute_opportunity_primary_quote_core_v1");
    expect(migration).toContain("primary_series.current_revision_id");
    expect(migration).toContain("source_quote_revision_id");
    expect(migration).toContain("source_quote_updated_at");
    expect(migration).toContain("source_quote_hash");
    expect(migration).toContain("from public.project_quote_line_items line");
    expect(migration).toContain("from public.opportunity_pricing_worksheets workbook");
  });

  it("keeps single and bulk distribution idempotent and concurrency safe", () => {
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("case when result.created then 'created' else 'skipped' end");
    expect(migration).toContain("Create the Primary Client quote before creating missing Tender Client quotes");
  });

  it("allocates quote numbers at the organization-wide uniqueness scope", () => {
    expect(numberAllocationFix).toContain("opportunity-quote-number:");
    expect(numberAllocationFix).toContain("where series.organization_id = p_organization_id");
    expect(numberAllocationFix).toContain("from public.project_quotes quote");
    expect(numberAllocationFix).toContain("where quote.organization_id = p_organization_id");
    expect(numberAllocationFix).not.toContain(
      "where series.organization_id = p_organization_id and series.opportunity_id = p_opportunity_id;\n  resolved_number",
    );
  });

  it("removes Master runtime functions while retaining legacy columns for compatibility", () => {
    expect(migration).toContain("drop function if exists public.get_or_create_opportunity_master_quote_v1");
    expect(migration).toContain("drop function if exists public.distribute_opportunity_master_quote_core_v1");
    expect(migration).toContain("legacy_master_deprecated_at");
    expect(migration).not.toContain("drop column is_master_quote");
  });
});
