import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260822190000_add_takeoff_calibration_unit_repair_rpc.sql"),
  "utf8"
);

describe("takeoff calibration unit repair migration", () => {
  it("is service-role-only and supports a non-mutating dry run", () => {
    expect(migration).toContain("arg_dry_run boolean default true");
    expect(migration).toContain("if arg_dry_run then");
    expect(migration).toContain("requires the service role");
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
  });

  it("locks one explicit calibration and requires every dependent measurement", () => {
    expect(migration).toContain("where id = arg_calibration_id\n  for update");
    expect(migration).toContain("dependent_ids <> proposed_ids");
    expect(migration).toContain("must include every dependent measurement exactly once");
  });

  it("records atomic before and after audit data", () => {
    expect(migration).toContain("takeoff_data_repair_audit");
    expect(migration).toContain("before_snapshot");
    expect(migration).toContain("after_snapshot");
  });
});
