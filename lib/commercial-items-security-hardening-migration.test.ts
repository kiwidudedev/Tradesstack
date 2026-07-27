import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260707133000_lock_down_commercial_item_reads_and_lineage.sql",
);

describe("commercial items security hardening migration", () => {
  const sql = readFileSync(migrationPath, "utf8");

  it("locks down direct commercial item reads to safe columns", () => {
    expect(sql).toContain("revoke select on public.commercial_items from authenticated;");
    expect(sql).toContain("grant select (");
    expect(sql).not.toContain("locked_metadata_json\n) on public.commercial_items to authenticated;");
  });

  it("revokes execute on the internal locked metadata rpc", () => {
    expect(sql).toContain("revoke execute on function public.get_commercial_item_locked_metadata_internal(uuid) from public;");
    expect(sql).toContain("revoke execute on function public.get_commercial_item_locked_metadata_internal(uuid) from anon;");
    expect(sql).toContain("revoke execute on function public.get_commercial_item_locked_metadata_internal(uuid) from authenticated;");
  });

  it("ties purchase order links back to the commercial item opportunity lineage", () => {
    expect(sql).toContain("project.source_opportunity_id = item.opportunity_id");
    expect(sql).toContain("when p_document_kind = 'purchase_order_line' then exists");
    expect(sql).toContain("Project must belong to the same opportunity");
  });

  it("strengthens nested JSON validation for snapshot, source link, and locked metadata", () => {
    expect(sql).toContain("create or replace function public.commercial_item_json_value_is_type");
    expect(sql).toContain("create or replace function public.commercial_item_json_text_matches_regex");
    expect(sql).toContain("or not public.commercial_item_json_object_has_required_keys(");
    expect(sql).toContain("commercial_item_json_value_is_type(snapshot_cell->'displayValue', array['string'])");
    expect(sql).toContain("perform (p_source_link->>'capturedAt')::timestamptz;");
    expect(sql).toContain("commercial_item_json_value_is_type(locked_cell->'formula', array['string', 'null'])");
  });
});
