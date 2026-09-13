import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  new URL("../supabase/migrations/20260826210000_add_takeoff_measurement_quote_publication.sql", import.meta.url),
  "utf8",
);

describe("Takeoff commercial provenance migration", () => {
  it("models Takeoff as a first-class source without worksheet identifiers", () => {
    expect(sql).toContain("source_takeoff_measurement_id");
    expect(sql).toContain("source_type in ('worksheet_selection', 'takeoff_measurement')");
    expect(sql).toMatch(/source_type = 'takeoff_measurement'[\s\S]*source_workbook_id is null[\s\S]*source_range is null/);
    expect(sql).toContain("pricing_source_kind in ('worksheet', 'takeoff', 'manual', 'unresolved')");
  });

  it("derives authoritative quantity from display/count values, never quantity", () => {
    expect(sql).toContain("coalesce(measurement.count_value, measurement.display_value)");
    expect(sql).toContain("else measurement.display_value end");
    expect(sql).not.toContain("measurement.quantity");
  });

  it("validates committed ownership and preserves atomic generic publication", () => {
    expect(sql).toContain("m.status = 'active'");
    expect(sql).toContain("public.project_drawing_sets");
    expect(sql).toContain("public.takeoff_pages");
    expect(sql).toContain("o.workspace_project_id = data_project_id");
    expect(sql).toContain("publish_commercial_quotes_v1");
    expect(sql).toContain("publish_worksheet_commercial_quotes_v1(p_input)");
    expect(sql).toContain("when 'takeoff_measurement' then 'takeoff'");
  });

  it("persists an immutable measurement and commercial snapshot", () => {
    for (const field of [
      "measurementId", "measurementVersion", "measurementUpdatedAt", "measurementKind",
      "drawingSetId", "pageId", "measurementName", "measurementDescription",
      "displayQuantity", "displayUnit", "commercialDescription", "commercialQuantity", "commercialRate",
    ]) expect(sql).toContain(`'${field}'`);
  });

  it("keeps the source measurement description separate from the editable commercial description", () => {
    expect(sql).toContain("'measurementName', measurement.name, 'measurementDescription', measurement.description");
    expect(sql).toContain("'commercialDescription', commercial_description");
    expect(sql).toContain("commercial_description, commercial_quantity, measurement.display_unit");
  });
});
