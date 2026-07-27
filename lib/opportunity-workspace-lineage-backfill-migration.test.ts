import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("opportunity workspace lineage backfill migration", () => {
  it("backfills safe one-to-one workspace projects with missing opportunity lineage", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations/20260707193000_backfill_opportunity_workspace_project_lineage.sql"),
      "utf8",
    );

    expect(sql).toContain("set source_opportunity_id = candidate.opportunity_id");
    expect(sql).toContain("linked_project.source_opportunity_id is null");
    expect(sql).toContain("other_opportunity.workspace_project_id = opportunity.workspace_project_id");
    expect(sql).toContain("other_opportunity.id <> opportunity.id");
  });
});
