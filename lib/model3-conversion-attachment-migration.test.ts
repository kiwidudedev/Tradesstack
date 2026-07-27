import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260708133000_attach_canonical_commercial_history_on_conversion.sql",
);

describe("model 3 conversion attachment migration", () => {
  const sql = readFileSync(migrationPath, "utf8");

  it("removes the old workspace-project-only commercial item attachment rule", () => {
    expect(sql).toContain("create or replace function public.validate_commercial_item_record()");
    expect(sql).not.toContain("Commercial item project_id must match the opportunity workspace project");
    expect(sql).toContain("Commercial item project_id must belong to the same opportunity");
  });

  it("allows commercial items to attach to the converted project through rls", () => {
    expect(sql).toContain("drop policy if exists \"Privileged members can update commercial items\"");
    expect(sql).toContain("or p.source_opportunity_id = commercial_items.opportunity_id");
    expect(sql).not.toContain("o.workspace_project_id = commercial_items.project_id");
  });

  it("adds a dedicated rpc that attaches existing canonical commercial history to the converted project", () => {
    expect(sql).toContain("create or replace function public.attach_opportunity_commercial_history_to_project(");
    expect(sql).toContain("Project must belong to the same originating opportunity");
    expect(sql).toContain("Commercial quote history is already attached to a different project");
    expect(sql).toContain("update public.project_quotes quote");
    expect(sql).toContain("set project_id = p_project_id");
    expect(sql).toContain("update public.project_quote_line_items line");
    expect(sql).toContain("update public.commercial_items item");
    expect(sql).toContain("attached_quote_count integer");
    expect(sql).toContain("attached_quote_line_count integer");
    expect(sql).toContain("attached_commercial_item_count integer");
    expect(sql).toContain("revoke execute on function public.attach_opportunity_commercial_history_to_project(uuid, uuid, uuid) from public");
    expect(sql).toContain("revoke execute on function public.attach_opportunity_commercial_history_to_project(uuid, uuid, uuid) from anon");
    expect(sql).toContain("grant execute on function public.attach_opportunity_commercial_history_to_project(uuid, uuid, uuid) to authenticated");
  });
});
