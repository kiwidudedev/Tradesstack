import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260707110000_add_commercial_items_foundation.sql",
);

describe("commercial items foundation migration", () => {
  const sql = readFileSync(migrationPath, "utf8");

  it("creates the commercial items tables with security boundaries", () => {
    expect(sql).toContain("create table if not exists public.commercial_items");
    expect(sql).toContain("create table if not exists public.commercial_item_document_links");
    expect(sql).toContain("source_status in ('current', 'stale', 'broken', 'needs_review')");
    expect(sql).toContain("jsonb_typeof(locked_metadata_json) = 'object'");
    expect(sql).toContain("alter table public.commercial_items enable row level security;");
    expect(sql).toContain("alter table public.commercial_item_document_links enable row level security;");
  });

  it("adds the expected indexes and uniqueness guardrails", () => {
    expect(sql).toContain("create index if not exists commercial_items_org_opportunity_idx");
    expect(sql).toContain("create index if not exists commercial_items_source_lookup_idx");
    expect(sql).toContain("create unique index if not exists commercial_item_document_links_unique_doc_line_source_idx");
    expect(sql).toContain("on public.commercial_item_document_links (commercial_item_id, document_kind, document_line_id);");
  });

  it("defines the base commercial item rpc contracts", () => {
    expect(sql).toContain("create or replace function public.get_commercial_item(p_commercial_item_id uuid)");
    expect(sql).toContain("create or replace function public.list_commercial_items_for_opportunity(");
    expect(sql).toContain("create or replace function public.create_commercial_item(p_input jsonb)");
    expect(sql).toContain("create or replace function public.link_commercial_item_to_quote_line(p_input jsonb)");
    expect(sql).toContain("create or replace function public.link_commercial_item_to_purchase_order_line(p_input jsonb)");
    expect(sql).toContain("grant execute on function public.create_commercial_item(jsonb) to authenticated;");
  });

  it("uses server-side permission checks instead of frontend trust", () => {
    expect(sql).toContain("public.has_org_permission(resolved_organization_id, 'leads.opportunities.write')");
    expect(sql).toContain("public.has_org_permission(resolved_organization_id, 'quotes.write')");
    expect(sql).toContain("public.has_org_permission(resolved_organization_id, 'purchase_orders.write')");
    expect(sql).toContain("source_link_json");
    expect(sql).toContain("locked_metadata_json");
  });
});
