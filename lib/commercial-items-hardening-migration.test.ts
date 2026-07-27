import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260707123000_harden_commercial_items_foundation.sql",
);

function extractFunctionBlock(sql: string, functionName: string) {
  const pattern = new RegExp(`create or replace function public\\.${functionName}[\\s\\S]*?\\$\\$;`, "i");
  const match = sql.match(pattern);
  return match?.[0] ?? "";
}

describe("commercial items hardening migration", () => {
  const sql = readFileSync(migrationPath, "utf8");

  it("adds project and opportunity scope guards for commercial item writes", () => {
    expect(sql).toContain("Commercial item project_id must match the opportunity workspace project");
    expect(sql).toContain("o.workspace_project_id = commercial_items.project_id");
    expect(sql).toContain("where worksheet.id = commercial_items.source_worksheet_id");
  });

  it("locks quote and purchase order links to the same scoped project lineage", () => {
    expect(sql).toContain("quote.source_opportunity_id = item.opportunity_id");
    expect(sql).toContain("opportunity.workspace_project_id = item.project_id");
    expect(sql).toContain("purchase_order.project_id");
    expect(sql).toContain("Commercial item document link failed scope validation");
  });

  it("prevents multiple source links on the same quote or purchase order line", () => {
    expect(sql).toContain("create unique index if not exists commercial_item_document_links_unique_quote_line_source_idx");
    expect(sql).toContain("create unique index if not exists commercial_item_document_links_unique_purchase_order_line_source_idx");
    expect(sql).toContain("Quote line already has a source commercial item");
    expect(sql).toContain("Purchase order line already has a source commercial item");
  });

  it("removes locked metadata from default read rpc contracts", () => {
    const getFunction = extractFunctionBlock(sql, "get_commercial_item");
    const listFunction = extractFunctionBlock(sql, "list_commercial_items_for_opportunity");

    expect(getFunction).not.toContain("locked_metadata_json");
    expect(listFunction).not.toContain("locked_metadata_json");
    expect(sql).toContain("create or replace function public.get_commercial_item_locked_metadata_internal");
  });

  it("adds server-side JSON validation and blocks unsafe snapshot/source-link keys", () => {
    expect(sql).toContain("create or replace function public.validate_commercial_item_snapshot_json");
    expect(sql).toContain("create or replace function public.validate_commercial_item_source_link_json");
    expect(sql).toContain("create or replace function public.validate_commercial_item_locked_metadata_json");
    expect(sql).toContain("if snapshot_cell ? 'formula' or snapshot_cell ? 'metadata' then");
    expect(sql).toContain("or p_source_link ? 'worksheetMetadata'");
    expect(sql).toContain("source_link_json failed commercial item validation");
  });
});
