import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260711130628_fix_module_owned_pricing_worksheet_saved_event_schema.sql",
);

describe("module-owned pricing worksheet variation support migration", () => {
  it("writes worksheet_saved events with the real intelligence_events schema", () => {
    const sql = readFileSync(migrationPath, "utf8");
    const intelligenceEventInsert = sql.slice(
      sql.indexOf("insert into public.intelligence_events"),
      sql.indexOf("on conflict (organization_id, source_request_id)"),
    );

    expect(intelligenceEventInsert).toContain("insert into public.intelligence_events");
    expect(intelligenceEventInsert).toContain("event_family");
    expect(intelligenceEventInsert).toContain("action");
    expect(intelligenceEventInsert).toContain("entity_type");
    expect(intelligenceEventInsert).toContain("metadata");
    expect(intelligenceEventInsert).not.toContain("\n    summary,");
    expect(intelligenceEventInsert).not.toContain("\n    details,");
  });

  it("preserves workbook owner metadata on worksheet_saved events", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("'ownerType'");
    expect(sql).toContain("'ownerVariationId', v_workbook.variation_id");
    expect(sql).toContain("'ownerQuoteId', v_workbook.quote_id");
    expect(sql).toContain("'projectId', v_workbook.project_id");
    expect(sql).toContain("'worksheetId', v_workbook.id");
    expect(sql).toContain("'sheetId', v_sheet.id");
  });
});
