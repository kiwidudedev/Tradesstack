import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260823170000_retire_legacy_cost_item_classification.sql",
);

describe("Cost Item Construction Intelligence separation", () => {
  it("enqueues routed Cost Items from an independent database trigger", () => {
    const sql = fs.readFileSync(migrationPath, "utf8");
    const triggerFunction = sql.slice(
      sql.indexOf("create or replace function public.enqueue_current_cost_item_construction_intelligence"),
      sql.indexOf("drop trigger if exists cost_items_enqueue_construction_intelligence"),
    );

    expect(triggerFunction).toContain("enqueue_cost_construction_intelligence_event");
    expect(triggerFunction).toContain("'tradesstackCostCode'");
    expect(triggerFunction).toContain("'parentCostItemId'");
    expect(triggerFunction).toContain("'rawDescription'");
    expect(triggerFunction).not.toContain("original_classification");
    expect(triggerFunction).not.toContain("final_classification");
    expect(triggerFunction).not.toContain("work_type");
    expect(triggerFunction).not.toContain("cost_type");
  });
});
