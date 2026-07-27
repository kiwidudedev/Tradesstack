import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260605235500_add_worksheet_edit_intelligence_event_idempotency.sql",
);

describe("worksheet edit intelligence idempotency migration", () => {
  it("adds a unique replay key index for raw worksheet edit events", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("create unique index if not exists intelligence_events_pricing_worksheet_edit_source_request_idx");
    expect(sql).toContain("on public.intelligence_events (organization_id, source_request_id)");
    expect(sql).toContain("'worksheet_cell_edited'");
    expect(sql).toContain("'worksheet_formula_edited'");
    expect(sql).toContain("'worksheet_rate_changed'");
    expect(sql).toContain("'worksheet_assumption_changed'");
  });

  it("returns an existing row id when a replayed edit event hits the same source_request_id", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("resolved_source_request_id := nullif(btrim(coalesce(p_input->>'sourceRequestId', '')), '');");
    expect(sql).toContain("on conflict do nothing");
    expect(sql).toContain("if inserted_id is null and resolved_source_request_id is not null then");
    expect(sql).toContain("and e.source_request_id = resolved_source_request_id");
    expect(sql).toContain("return inserted_id;");
  });

  it("keeps batch retries safe by resolving each event through the idempotent single-event writer", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("inserted_id := public.write_intelligence_event(event_item);");
    expect(sql).toContain("'ids', inserted_ids");
  });
});
