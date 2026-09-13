import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260823120000_add_multi_drawing_takeoff_metadata.sql"),
  "utf8",
);

describe("multi-drawing Takeoff metadata migration", () => {
  it("adds friendly names, deterministic ordering, lifecycle and source identity", () => {
    expect(migration).toContain("add column if not exists display_name text");
    expect(migration).toContain("add column if not exists sort_order integer");
    expect(migration).toContain("add column if not exists archived_at timestamptz null");
    expect(migration).toContain("add column if not exists source_type text");
    expect(migration).toContain("add column if not exists source_revision text");
    expect(migration).toContain("regexp_replace(file_name, '\\.pdf$', '', 'i')");
    expect(migration).toContain("and page.drawing_set_id = drawing_set.id");
  });

  it("allocates project-scoped order under an advisory transaction lock", () => {
    expect(migration).toContain("assign_project_drawing_set_sort_order");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("max(existing.sort_order)");
    expect(migration).toContain("project_drawing_sets_project_sort_order_idx");
  });

  it("validates render job organization and project against its drawing", () => {
    expect(migration).toContain("validate_takeoff_render_job_consistency");
    expect(migration).toContain("drawing_set_row.organization_id <> new.organization_id");
    expect(migration).toContain("drawing_set_row.project_id <> new.project_id");
  });
});
