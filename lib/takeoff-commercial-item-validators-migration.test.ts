import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260826220000_fix_takeoff_commercial_item_validators.sql",
);

const sql = readFileSync(migrationPath, "utf8");

describe("Takeoff commercial item validator migration", () => {
  it("dispatches strict snapshot and source-link validation by source type", () => {
    expect(sql).toContain("validate_takeoff_commercial_item_snapshot_json");
    expect(sql).toContain("validate_takeoff_commercial_item_source_link_json");
    expect(sql).toContain("if p_snapshot->>'sourceType' = 'takeoff_measurement'");
    expect(sql).toContain("if p_source_link->>'sourceType' = 'takeoff_measurement'");
    expect(sql).toContain("commercial_item_json_object_has_only_keys");
    expect(sql).toContain("commercial_item_json_object_has_required_keys");
  });

  it("accepts the canonical Takeoff fields and checks total precision", () => {
    for (const key of [
      "measurementId",
      "measurementVersion",
      "measurementUpdatedAt",
      "measurementKind",
      "drawingSetId",
      "pageId",
      "measurementName",
      "measurementDescription",
      "displayQuantity",
      "displayUnit",
      "commercialDescription",
      "commercialQuantity",
      "commercialRate",
      "commercialTotal",
    ]) {
      expect(sql).toContain(`'${key}'`);
    }

    expect(sql).toContain("coalesce(p_snapshot->>'measurementKind', '') not in ('line', 'area', 'count')");
    expect(sql).toContain("round(commercial_quantity * commercial_rate, 2) <> commercial_total");
  });

  it("keeps Takeoff locked metadata minimal and worksheet metadata strict", () => {
    expect(sql).toContain("validate_takeoff_commercial_item_locked_metadata_json");
    expect(sql).toContain("p_locked_metadata = '{}'::jsonb");
    expect(sql).toContain("validate_commercial_item_locked_metadata_json(new.locked_metadata_json)");
    expect(sql).toContain("validate_takeoff_commercial_item_locked_metadata_json(new.locked_metadata_json)");
  });

  it("cross-validates Takeoff relational identity and isolates worksheet checks", () => {
    expect(sql).toContain("if new.source_type = 'worksheet_selection' then");
    expect(sql).toContain("elsif new.source_type = 'takeoff_measurement' then");
    expect(sql).toContain("Takeoff measurementId must match source_takeoff_measurement_id");
    expect(sql).toContain("Takeoff measurementVersion must match source_version");
    expect(sql).toContain("Takeoff commercial items must contain only Takeoff source identity");
    expect(sql).toContain("source_link_json worksheetVersion must match source_version");
    expect(sql).toContain("locked_metadata_json worksheetVersion must match source_version");
  });

  it("is forward-only and reuses the existing validation trigger", () => {
    expect(sql.trimStart()).toMatch(/^begin;/);
    expect(sql.trimEnd()).toMatch(/commit;$/);
    expect(sql).toContain("create or replace function public.validate_commercial_item_record()");
    expect(sql).not.toContain("drop trigger");
    expect(sql).not.toContain("create trigger");
  });
});

