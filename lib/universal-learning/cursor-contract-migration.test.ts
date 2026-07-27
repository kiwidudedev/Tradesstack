import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("universal learning multi-source cursor contract migration", () => {
  const migration = readFileSync(
    path.join(process.cwd(), "supabase/migrations/20260625110000_widen_universal_learning_cursor_identity_to_text.sql"),
    "utf8",
  );

  it("widens cursor state columns from uuid to text without touching source record ids", () => {
    expect(migration).toContain("alter table public.learning_review_cursors");
    expect(migration).toContain("alter column last_cursor_id type text using last_cursor_id::text");
    expect(migration).toContain("alter table public.learning_review_runs");
    expect(migration).toContain("alter column previous_cursor_id type text using previous_cursor_id::text");
    expect(migration).toContain("alter column candidate_next_cursor_id type text using candidate_next_cursor_id::text");
    expect(migration).toContain("alter column final_next_cursor_id type text using final_next_cursor_id::text");
    expect(migration).not.toContain("learning_review_run_records");
    expect(migration).not.toContain("source_id type text");
  });
});
