import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260606043000_fix_worksheet_saved_event_write_permissions.sql",
);

describe("worksheet saved permissions fix migration", () => {
  it("routes worksheet_saved persistence through the security-definer event writer", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("create or replace function public.save_opportunity_pricing_workbook_active_sheet");
    expect(sql).toContain("security invoker");
    expect(sql).toContain("perform public.write_intelligence_event(");
    expect(sql).not.toContain("insert into public.intelligence_events");
  });
});
