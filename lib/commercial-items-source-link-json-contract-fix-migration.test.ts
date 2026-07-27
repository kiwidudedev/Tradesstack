import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260711194500_fix_commercial_item_source_link_json_contract.sql",
);

describe("commercial item source link json contract fix migration", () => {
  const sql = readFileSync(migrationPath, "utf8");

  it("allows current worksheet ownership and lineage fields in sourceLinkJson", () => {
    expect(sql).toContain("'ownerType'");
    expect(sql).toContain("'opportunityId'");
    expect(sql).toContain("'opportunitySlug'");
    expect(sql).toContain("'projectId'");
    expect(sql).toContain("'projectSlug'");
    expect(sql).toContain("'quoteId'");
    expect(sql).toContain("'variationId'");
    expect(sql).toContain("coalesce(p_source_link->>'ownerType', '') not in ('', 'opportunity', 'variation')");
  });

  it("keeps the validator strict about worksheet primitives and hidden worksheet payloads", () => {
    expect(sql).toContain("commercial_item_json_is_non_negative_integer_like(p_source_link->'worksheetVersion')");
    expect(sql).toContain("p_source_link ? 'formula'");
    expect(sql).toContain("p_source_link ? 'worksheetMetadata'");
    expect(sql).toContain("perform (p_source_link->>'capturedAt')::timestamptz;");
  });
});
