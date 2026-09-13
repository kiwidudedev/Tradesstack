import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260820140000_fix_legacy_auto_draft_canonical_selection.sql",
  "utf8",
);

describe("legacy automatic Project quote Draft routing migration", () => {
  it("classifies legacy Drafts by provenance and commercial value equality", () => {
    expect(migration).toContain("classify_legacy_automatic_project_quote_draft_v1");
    expect(migration).toContain("deterministic_id_match");
    expect(migration).toContain("expected_predecessor");
    expect(migration).toContain("quote_values_match");
    expect(migration).toContain("except all");
    expect(migration).toContain("workbook_untouched");
    expect(migration).toContain("successor_absent");
  });

  it("bridges a preserved legacy P1 to the next explicit revision", () => {
    expect(migration).toContain("created_revision.quote_number from '-P([0-9]+)$'");
    expect(migration).toContain("project_suffix + 1");
    expect(migration).toContain("created_revision.quote_id, next_quote_number");
    expect(migration).not.toContain("delete from public.project_quotes");
  });
});
