import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260621190000_harden_financial_routing_mirror_writes.sql"
);

describe("financial routing mirror migration", () => {
  const sql = readFileSync(migrationPath, "utf8");

  it("adds deterministic SQL routing and mapping helpers", () => {
    expect(sql).toContain("create or replace function public.resolve_default_tradesstack_accounting_mapping");
    expect(sql).toContain("create or replace function public.resolve_cost_item_financial_routing_defaults");
    expect(sql).toContain("Missing accounting mapping for TradesStack routing code.");
  });

  it("rewrites the cost-item mirror functions to populate routing fields", () => {
    expect(sql).toContain("create or replace function public.upsert_opportunity_quote_cost_items");
    expect(sql).toContain("create or replace function public.upsert_cost_items_for_document");
    expect(sql).toContain("create or replace function public.upsert_cost_items_for_project_variation");
    expect(sql).toContain("create or replace function public.upsert_cost_items_for_project_purchase_order");
    expect(sql).toContain("create or replace function public.upsert_cost_items_for_project_claim");
    expect(sql).toContain("tradesstack_cost_code");
    expect(sql).toContain("tradesstack_cost_code_label");
    expect(sql).toContain("financial_routing_confidence");
    expect(sql).toContain("financial_routing_source");
    expect(sql).toContain("review_status");
    expect(sql).toContain("review_reason");
    expect(sql).toContain("ai_construction_intelligence");
  });

  it("repairs current unrouted dev data for cost items, allocations, and actual costs", () => {
    expect(sql).toContain("with repair_candidates as (");
    expect(sql).toContain("), repaired_cost_items as (");
    expect(sql).toContain("with allocation_candidates as (");
    expect(sql).toContain("), repaired_allocations as (");
    expect(sql).toContain("with actual_cost_candidates as (");
    expect(sql).toContain("), repaired_actual_costs as (");
    expect(sql).toContain("source_document_kind in ('project_purchase_order', 'project_variation', 'project_claim', 'opportunity_quote', 'project_quote')");
  });
});
