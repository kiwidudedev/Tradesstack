import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260714213000_fix_commercial_item_link_scope_and_rpc_grants.sql",
);

function extractBlock(sql: string, anchor: string, nextAnchor: string) {
  const start = sql.indexOf(anchor);
  const end = sql.indexOf(nextAnchor, start);
  return start >= 0 && end >= 0 ? sql.slice(start, end) : "";
}

describe("commercial item link scope and rpc grants regression migration", () => {
  const sql = readFileSync(migrationPath, "utf8");
  const quoteBranch = extractBlock(sql, "when p_document_kind = 'quote_line' then exists (", "when p_document_kind = 'purchase_order_line' then exists (");
  const purchaseOrderBranch = extractBlock(sql, "when p_document_kind = 'purchase_order_line' then exists (", "when p_document_kind = 'variation_line' then exists (");
  const variationBranch = extractBlock(sql, "when p_document_kind = 'variation_line' then exists (", "else false");

  it("restores canonical pre-award and post-award quote scope validation", () => {
    expect(quoteBranch).toContain("quote.originating_opportunity_id = item.opportunity_id");
    expect(quoteBranch).toContain("item.project_id is not distinct from quote.project_id");
    expect(quoteBranch).toContain("line.project_id is not distinct from quote.project_id");
    expect(quoteBranch).toContain("quote.project_id is null");
    expect(quoteBranch).toContain("project.source_opportunity_id = item.opportunity_id");
    expect(quoteBranch).not.toContain("item.project_id is not null");
    expect(quoteBranch).not.toContain("workspace_project_id");
    expect(quoteBranch).not.toContain("join public.organization_projects project\n        on project.id = item.project_id");
  });

  it("keeps purchase order scope validation project-bound", () => {
    expect(purchaseOrderBranch).toContain("item.project_id is not null");
    expect(purchaseOrderBranch).toContain("item.project_id = line.project_id");
    expect(purchaseOrderBranch).toContain("item.project_id = purchase_order.project_id");
    expect(purchaseOrderBranch).toContain("project.source_opportunity_id = item.opportunity_id");
  });

  it("preserves variation scope validation with project and variation lineage", () => {
    expect(variationBranch).toContain("item.project_id = line.project_id");
    expect(variationBranch).toContain("item.project_id = variation.project_id");
    expect(variationBranch).toContain("project.source_opportunity_id = item.opportunity_id");
    expect(variationBranch).toContain("item.source_link_json->>'variationId'");
    expect(variationBranch).toContain("existing_link.document_kind = 'variation_line'");
  });

  it("locks worksheet publish link rpc execute grants back down to authenticated only", () => {
    expect(sql).toContain("revoke execute on function public.link_commercial_item_to_quote_line(jsonb) from public;");
    expect(sql).toContain("revoke execute on function public.link_commercial_item_to_quote_line(jsonb) from anon;");
    expect(sql).toContain("grant execute on function public.link_commercial_item_to_quote_line(jsonb) to authenticated;");
    expect(sql).toContain("revoke execute on function public.link_commercial_item_to_purchase_order_line(jsonb) from public;");
    expect(sql).toContain("revoke execute on function public.link_commercial_item_to_purchase_order_line(jsonb) from anon;");
    expect(sql).toContain("grant execute on function public.link_commercial_item_to_purchase_order_line(jsonb) to authenticated;");
    expect(sql).toContain("revoke execute on function public.link_commercial_item_to_variation_line(jsonb) from public;");
    expect(sql).toContain("revoke execute on function public.link_commercial_item_to_variation_line(jsonb) from anon;");
    expect(sql).toContain("grant execute on function public.link_commercial_item_to_variation_line(jsonb) to authenticated;");
  });
});
