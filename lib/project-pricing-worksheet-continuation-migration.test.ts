import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  new URL("../supabase/migrations/20260819210000_add_project_pricing_worksheet_continuations.sql", import.meta.url),
  "utf8",
);

describe("Project pricing worksheet continuations", () => {
  it("enforces one active continuation per source and Project", () => {
    expect(sql).toContain("opportunity_pricing_worksheets_project_source_continuation_unique");
    expect(sql).toContain("clone_kind in ('project_working', 'project_workspace')");
  });

  it("reuses an accepted-linked project_working clone before creating project_workspace", () => {
    const lookup = sql.indexOf("candidate.clone_kind in ('project_working', 'project_workspace')");
    const insert = sql.indexOf("manifest_id, null, 'project_workspace'");
    expect(lookup).toBeGreaterThan(-1);
    expect(insert).toBeGreaterThan(lookup);
  });

  it("clones every active Opportunity source workbook with deterministic identities", () => {
    expect(sql).toContain("source.project_id is null and source.quote_id is null and source.variation_id is null");
    expect(sql).toContain(":project-workbook:");
    expect(sql).toContain(":project-sheet:");
    expect(sql).toContain("regenerate_worksheet_material_binding_ids");
  });

  it("preserves every sheet's worksheet JSON, formulas, formatting, and extracted pricing payload", () => {
    expect(sql).toContain("for source_sheet in");
    expect(sql).toContain("source_sheet.name, source_sheet.sheet_order, source_sheet.is_default");
    expect(sql).toContain("public.regenerate_worksheet_material_binding_ids(source_sheet.worksheet_data)");
    expect(sql).toContain("source_sheet.pricing_summary, source_sheet.extracted_pricing_data");
    // Formula and formatting state live inside worksheet_data and are copied as
    // one JSON document; only materialPricing.bindingId is regenerated.
    expect(sql).not.toMatch(/source_sheet\.worksheet_data\s*->/);
  });

  it("remaps the active sheet to its deterministic cloned equivalent", () => {
    expect(sql).toContain("when source_workbook.last_active_sheet_id is not null");
    expect(sql).toContain("':project-sheet:' || source_workbook.last_active_sheet_id::text");
  });

  it("keeps material evidence while generating a distinct binding identity", () => {
    const bindingMigration = readFileSync(
      new URL("../supabase/migrations/20260816140000_add_worksheet_material_price_provenance.sql", import.meta.url),
      "utf8",
    );
    expect(bindingMigration).toContain("array['cells', v_cell.key, 'metadata', 'materialPricing', 'bindingId']");
    expect(bindingMigration).toContain("to_jsonb(gen_random_uuid()::text)");
    expect(bindingMigration).not.toMatch(/-\s*'materialId'/);
    expect(bindingMigration).not.toMatch(/-\s*'supplierId'/);
    expect(bindingMigration).not.toMatch(/-\s*'supplierProductId'/);
  });

  it("extends the atomic finalizer and preserves an auditable dry-run reconciliation", () => {
    expect(sql).toContain("finalize_opportunity_award_pricing_core_v1");
    expect(sql).toContain("ensure_opportunity_project_pricing_workbooks_v1");
    expect(sql).toContain("reconcile_project_pricing_workbooks_v1");
    expect(sql).toContain("p_dry_run boolean default true");
  });

  it("repairs a missing continuation on retry without duplicating an existing clone", () => {
    const lookup = sql.indexOf("candidate.source_workbook_id = source_workbook.id");
    const deterministicInsert = sql.indexOf("destination_workbook_id := md5", lookup);
    expect(lookup).toBeGreaterThan(-1);
    expect(deterministicInsert).toBeGreaterThan(lookup);
    expect(sql).toContain("on conflict do nothing");
    expect(sql).toContain("resolved_reused_count := resolved_reused_count + 1");
  });

  it("keeps generic Project owner lineage and commercial permissions tenant-scoped", () => {
    expect(sql).toContain("project.source_opportunity_id = p_opportunity_id");
    expect(sql).toContain("has_org_permission(p_organization_id, 'quotes.write')");
    expect(sql).toContain("is_member_of_organization(p_organization_id)");
  });
});
