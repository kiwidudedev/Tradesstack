import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("project source opportunity lineage repair migration", () => {
  it("repairs only safe workspace or converted-project lineage matches", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations/20260711151500_add_project_source_opportunity_lineage_repair_rpc.sql"),
      "utf8",
    );

    expect(sql).toContain("create or replace function public.repair_project_source_opportunity_lineage(");
    expect(sql).toContain("opportunity.workspace_project_id = project_row.id");
    expect(sql).toContain("opportunity.converted_project_id = project_row.id");
    expect(sql).toContain("Project source opportunity lineage is ambiguous");
    expect(sql).toContain("grant execute on function public.repair_project_source_opportunity_lineage(uuid) to authenticated;");
  });
});
