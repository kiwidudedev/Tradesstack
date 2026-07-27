import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260714143000_fix_quote_commercial_item_link_scope_regression.sql",
);

function extractBlock(sql: string, anchor: string, nextAnchor: string) {
  const start = sql.indexOf(anchor);
  const end = sql.indexOf(nextAnchor, start);
  return start >= 0 && end >= 0 ? sql.slice(start, end) : "";
}

describe("quote commercial item link scope regression migration", () => {
  const sql = readFileSync(migrationPath, "utf8");
  const quoteBranch = extractBlock(sql, "when p_document_kind = 'quote_line' then exists (", "when p_document_kind = 'purchase_order_line' then exists (");
  const purchaseOrderBranch = extractBlock(sql, "when p_document_kind = 'purchase_order_line' then exists (", "else false");

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

  it("leaves purchase order scope validation project-bound", () => {
    expect(purchaseOrderBranch).toContain("item.project_id is not null");
    expect(purchaseOrderBranch).toContain("item.project_id = line.project_id");
    expect(purchaseOrderBranch).toContain("item.project_id = purchase_order.project_id");
    expect(purchaseOrderBranch).toContain("project.source_opportunity_id = item.opportunity_id");
  });
});
