import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260711191500_fix_commercial_item_source_link_trigger_contract.sql",
);

describe("commercial item source link trigger contract fix migration", () => {
  const sql = readFileSync(migrationPath, "utf8");

  it("keeps project lineage tied to the originating opportunity", () => {
    expect(sql).toContain("Commercial item project_id must belong to the same opportunity");
    expect(sql).not.toContain("workspace project");
  });

  it("restores worksheetVersion-based source link validation", () => {
    expect(sql).toContain("source_link_json worksheetVersion must match source_version");
    expect(sql).toContain("locked_metadata_json worksheetVersion must match source_version");
    expect(sql).not.toContain("source_link_json version must match source_version");
    expect(sql).not.toContain("source_link_json sourceStatus must match source_status");
  });
});
