import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("project quote retention default migration", () => {
  it("adds the missing retention_percent_default column back to project_quotes", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations/20260708124500_add_missing_project_quote_retention_default.sql"),
      "utf8",
    );

    expect(sql).toContain("alter table public.project_quotes");
    expect(sql).toContain("add column if not exists retention_percent_default numeric(7,3) not null default 0");
    expect(sql).toContain("update public.project_quotes");
  });
});
