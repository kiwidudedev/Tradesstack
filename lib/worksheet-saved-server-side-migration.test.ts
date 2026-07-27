import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260605224500_move_worksheet_saved_intelligence_event_server_side.sql",
);
const boardPath = resolve(
  process.cwd(),
  "components/app/OpportunityPricingWorksheetBoard.tsx",
);

describe("worksheet_saved server-side intelligence migration", () => {
  it("adds a save request id to the workbook save rpc and inserts worksheet_saved events server-side", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("p_save_request_id text default null");
    expect(sql).toContain("insert into public.intelligence_events");
    expect(sql).toContain("'worksheet_saved'");
    expect(sql).toContain("'pricing_worksheet_page'");
    expect(sql).toContain("'pricing_workbook'");
  });

  it("deduplicates retried worksheet_saved writes by source_request_id", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("create unique index if not exists intelligence_events_pricing_worksheet_saved_source_request_idx");
    expect(sql).toContain("on public.intelligence_events (organization_id, source_request_id)");
    expect(sql).toContain("event_type = 'worksheet_saved'");
    expect(sql).toContain("on conflict do nothing");
  });

  it("keeps worksheet_saved metadata shape compatible with the browser event", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("'workbookId', v_workbook.id");
    expect(sql).toContain("'worksheetId', v_workbook.id");
    expect(sql).toContain("'sheetId', v_sheet.id");
    expect(sql).toContain("'structureSummary', public._pricing_worksheet_structure_summary(v_sheet.worksheet_data)");
    expect(sql).toContain("'source', 'system'");
  });

  it("removes browser-side worksheet_saved emission from the save lifecycle", () => {
    const boardSource = readFileSync(boardPath, "utf8");

    expect(boardSource).not.toContain('eventType: "worksheet_saved"');
    expect(boardSource).not.toContain('logPricingWorksheetIntelligenceFailure("worksheet_saved"');
  });
});
