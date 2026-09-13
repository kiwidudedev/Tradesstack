import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260822160000_fix_takeoff_calibration_version_fk_order.sql"),
  "utf8",
);

describe("takeoff calibration version transaction order", () => {
  it("inserts the replacement before linking prior versions to its foreign key", () => {
    const insertOffset = migration.indexOf("insert into public.takeoff_calibrations");
    const supersessionOffset = migration.indexOf("set superseded_by = arg_id");

    expect(insertOffset).toBeGreaterThan(-1);
    expect(supersessionOffset).toBeGreaterThan(insertOffset);
  });

  it("locks and deactivates only the fully scoped current page calibration", () => {
    expect(migration).toContain("organization_id = arg_organization_id");
    expect(migration).toContain("project_id = arg_project_id");
    expect(migration).toContain("opportunity_id = arg_opportunity_id");
    expect(migration).toContain("page_id = arg_page_id");
    expect(migration).toContain("for update");
  });
});
