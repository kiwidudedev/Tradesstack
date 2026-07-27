import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260707170000_fix_quote_stage3_lineage_save_flow.sql",
);

describe("commercial items stage 3 quote lineage migration", () => {
  const sql = readFileSync(migrationPath, "utf8");

  it("hydrates quote source opportunity lineage from the project inside the save rpc", () => {
    expect(sql).toContain("select p.source_opportunity_id");
    expect(sql).toContain("into resolved_project_source_opportunity_id");
    expect(sql).toContain("source_opportunity_id = coalesce(q.source_opportunity_id, resolved_project_source_opportunity_id)");
    expect(sql).toContain("organization_id, project_id, source_opportunity_id, created_by");
    expect(sql).toContain("p_organization_id, p_project_id, resolved_project_source_opportunity_id, auth.uid()");
  });
});
