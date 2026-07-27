import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260707150000_fix_commercial_item_entrypoint_blockers.sql",
);

function extractFunctionBlock(sql: string, functionName: string) {
  const pattern = new RegExp(`create or replace function public\\.${functionName}[\\s\\S]*?\\$\\$;`, "i");
  const match = sql.match(pattern);
  return match?.[0] ?? "";
}

describe("commercial items entrypoint blocker migration", () => {
  const sql = readFileSync(migrationPath, "utf8");

  it("accepts legitimate worksheet payload counts and indexes as numbers", () => {
    expect(sql).toContain("create or replace function public.commercial_item_json_is_non_negative_integer_like");
    expect(sql).toContain("jsonb_typeof(p_value) = 'number'");
    expect(sql).toContain("commercial_item_json_is_non_negative_integer_like(p_snapshot->'rowCount')");
    expect(sql).toContain("commercial_item_json_is_non_negative_integer_like(snapshot_column->'index')");
    expect(sql).toContain("commercial_item_json_is_non_negative_integer_like(snapshot_cell->'rowIndex')");
    expect(sql).toContain("commercial_item_json_is_non_negative_integer_like(p_source_link->'worksheetVersion')");
    expect(sql).toContain("commercial_item_json_is_non_negative_integer_like(locked_cell->'columnIndex')");
  });

  it("replaces ambiguous quote link upsert columns with an update then insert flow", () => {
    const quoteFunction = extractFunctionBlock(sql, "link_commercial_item_to_quote_line");

    expect(quoteFunction).toContain("update public.commercial_item_document_links as existing_link");
    expect(quoteFunction).toContain("existing_link.commercial_item_id = resolved_commercial_item_id");
    expect(quoteFunction).toContain("if not found then");
    expect(quoteFunction).toContain("insert into public.commercial_item_document_links");
    expect(quoteFunction).not.toContain("on conflict (commercial_item_id, document_kind, document_line_id)");
  });

  it("replaces ambiguous purchase order link upsert columns with an update then insert flow", () => {
    const purchaseOrderFunction = extractFunctionBlock(sql, "link_commercial_item_to_purchase_order_line");

    expect(purchaseOrderFunction).toContain("update public.commercial_item_document_links as existing_link");
    expect(purchaseOrderFunction).toContain("existing_link.commercial_item_id = resolved_commercial_item_id");
    expect(purchaseOrderFunction).toContain("if not found then");
    expect(purchaseOrderFunction).toContain("insert into public.commercial_item_document_links");
    expect(purchaseOrderFunction).not.toContain("on conflict (commercial_item_id, document_kind, document_line_id)");
  });
});
