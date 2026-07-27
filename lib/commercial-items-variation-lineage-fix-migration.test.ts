import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260711183000_fix_commercial_item_project_lineage_for_variations_and_purchase_orders.sql",
);

describe("commercial item variation lineage fix migration", () => {
  const sql = readFileSync(migrationPath, "utf8");

  it("removes workspace bridge project validation from commercial item creation", () => {
    expect(sql).toContain("create or replace function public.create_commercial_item(p_input jsonb)");
    expect(sql).not.toContain("Project must match the opportunity workspace project");
    expect(sql).toContain("Project must belong to the same opportunity");
  });

  it("validates quote and purchase order links through originating project lineage", () => {
    expect(sql).toContain("create or replace function public.can_insert_commercial_item_document_link(");
    expect(sql).toContain("project.source_opportunity_id = item.opportunity_id");
    expect(sql).not.toContain("opportunity.workspace_project_id = item.project_id");
  });
});
