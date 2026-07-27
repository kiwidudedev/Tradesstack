import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("organization construction profile migration", () => {
  it("adds the organizations column and updates the canonical RPC", () => {
    const migrationPath = join(
      process.cwd(),
      "supabase/migrations/20260621203000_add_organization_construction_profile.sql"
    );
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("add column if not exists construction_profile text null");
    expect(sql).toContain("p_construction_profile text default null");
    expect(sql).toContain("nullif(trim(p_construction_profile), '')");
    expect(sql).toContain("construction_profile = case");
    expect(sql).toContain("else normalized_construction_profile");
  });
});
