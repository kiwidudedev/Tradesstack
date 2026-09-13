import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260823150000_add_atomic_worksheet_variation_publication.sql"), "utf8");

describe("atomic worksheet Variation publication migration", () => {
  it("allows the mirrored CostItem snapshot to preserve sparse Variation values", () => {
    expect(sql).toContain("alter table public.cost_items");
    expect(sql).toContain("alter column quantity drop not null");
    expect(sql).toContain("alter column unit_rate drop not null");
    expect(sql).toContain("alter column line_total drop not null");
  });

  it("creates a stable request ledger and serialized retry boundary", () => {
    expect(sql).toContain("create table if not exists public.worksheet_variation_publication_requests");
    expect(sql).toContain("primary key (organization_id, request_key)");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("if found then");
    expect(sql).toContain("existing_request.result_json");
  });

  it("enforces authorization, route lineage, mutable status, and optimistic concurrency", () => {
    expect(sql).toContain("public.has_org_permission(resolved_organization_id, 'variations.write')");
    expect(sql).toContain("variation_row.status not in ('Draft', 'Priced')");
    expect(sql).toContain("variation_row.updated_at is distinct from resolved_expected_updated_at");
    expect(sql).toContain("workbook.variation_id = resolved_variation_id");
    expect(sql).toContain("project.source_opportunity_id = resolved_opportunity_id");
  });

  it("creates/reuses commercial items and commits lines and provenance in one function transaction", () => {
    expect(sql).toContain("from public.create_commercial_item");
    expect(sql).toContain("from public.save_project_variation_draft");
    expect(sql).toContain("public.link_commercial_item_to_variation_line");
    expect(sql).toContain("accumulated_line_items");
    expect(sql).toContain("accumulated_commercial_item_ids");
    expect(sql).toContain("grant execute on function public.publish_worksheet_commercial_variation_v1(jsonb) to authenticated");
  });
});
