import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20261003130000_allow_project_quote_worksheet_source_links.sql",
);

describe("project and quote worksheet source-link migration", () => {
  const sql = readFileSync(migrationPath, "utf8");

  it("accepts every worksheet owner represented by the pricing worksheet routes", () => {
    expect(sql).toContain("('', 'opportunity', 'project', 'quote', 'variation')");
  });

  it("keeps the strict worksheet payload and hidden-data checks", () => {
    expect(sql).toContain("commercial_item_json_is_non_negative_integer_like(p_source_link->'worksheetVersion')");
    expect(sql).toContain("p_source_link ? 'worksheetMetadata'");
    expect(sql).toContain("perform (p_source_link->>'capturedAt')::timestamptz;");
  });
});
