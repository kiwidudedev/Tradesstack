import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261014120000_add_pricing_worksheet_template_library.sql"),
  "utf8",
);

describe("pricing worksheet template library migration", () => {
  it("keeps templates separate from opportunity-owned workbooks", () => {
    expect(migration).toContain("create table if not exists public.pricing_worksheet_templates");
    expect(migration).toContain("create table if not exists public.pricing_worksheet_template_versions");
    expect(migration).toContain("create table if not exists public.pricing_worksheet_template_version_sheets");
    expect(migration).not.toContain("opportunity_id uuid null");
  });

  it("protects tenant boundaries and grants database-side template permissions", () => {
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("force row level security");
    expect(migration).toContain("pricing_worksheets.templates.view");
    expect(migration).toContain("pricing_worksheets.templates.write");
    expect(migration).toContain("pricing_worksheets.templates.manage");
    expect(migration).toContain("create_pricing_worksheet_from_template_v1");
    expect(migration).toContain("can_write_pricing_workbook_owner");
  });

  it("uses immutable version snapshots and idempotent requests", () => {
    expect(migration).toContain("unique (organization_id, template_id, version_number)");
    expect(migration).toContain("unique (organization_id, request_id)");
    expect(migration).toContain("_detach_pricing_worksheet_material_bindings");
    expect(migration).toContain("_apply_pricing_worksheet_template_inputs");
    expect(migration).toContain("update_pricing_worksheet_template_metadata_v1");
    expect(migration).toContain("duplicate_pricing_worksheet_template_v1");
    expect(migration).toContain("duplicatedFromVersionId");
    expect(migration).toContain("save_pricing_worksheet_template_version_v1");
    expect(migration).toContain("This template has a newer version. Reload it before saving.");
  });

  it("keeps blank template creation separate from opportunity workbooks", () => {
    const blankMigration = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20261014133000_create_blank_pricing_worksheet_template.sql"),
      "utf8",
    );
    expect(blankMigration).toContain("create_pricing_worksheet_template_v1");
    expect(blankMigration).toContain("createdFrom', 'blank");
    expect(blankMigration).toContain("_detach_pricing_worksheet_material_bindings");
    expect(blankMigration).toContain("pricing_worksheets.templates.write");
    expect(blankMigration).toContain("source_workbook_id");
  });
});
