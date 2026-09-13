import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260801100000_prevent_opportunity_award_reversal.sql",
  "utf8",
);

describe("Stage 3 award reversal completion migration", () => {
  it("blocks contradictory ordinary updates without changing conversion or promotion", () => {
    expect(migration).toContain("prevent_opportunity_award_reversal_v1");
    expect(migration).toContain("if auth.uid() is null then");
    expect(migration).toContain("opportunity_final_projects");
    expect(migration).toContain("new.stage is distinct from 'Won'");
    expect(migration).toContain("new.converted_project_id is distinct from mapped_project_id");
    expect(migration).toContain("new.converted_at is null");
    expect(migration).not.toContain("promote_opportunity_workspace_v1");
    expect(migration).not.toMatch(/delete\s+from/i);
  });
});
