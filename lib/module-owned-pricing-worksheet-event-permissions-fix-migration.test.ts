import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260711170000_fix_module_owned_pricing_worksheet_event_permissions.sql",
);

describe("module-owned pricing worksheet event permissions fix migration", () => {
  it("routes module-owned worksheet_saved events through the security-definer writer", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("create or replace function public.save_pricing_workbook_active_sheet");
    expect(sql).toContain("security invoker");
    expect(sql).toContain("perform public.write_intelligence_event(");
    expect(sql).not.toContain("insert into public.intelligence_events");
  });

  it("preserves module owner metadata when writing worksheet_saved events", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("'projectId', v_workbook.project_id");
    expect(sql).toContain("'ownerType'");
    expect(sql).toContain("'ownerVariationId', v_workbook.variation_id");
    expect(sql).toContain("'ownerQuoteId', v_workbook.quote_id");
    expect(sql).toContain("'sheetId', v_sheet.id");
  });
});
