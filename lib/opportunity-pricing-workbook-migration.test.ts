import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260531130000_harden_opportunity_pricing_workbook_persistence.sql",
);
const deleteRpcMigrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260531150000_add_opportunity_pricing_workbook_sheet_delete_rpc.sql",
);
const deletePolicyMigrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260531173000_allow_workbook_editors_to_delete_sheets.sql",
);
const lastActiveSheetMigrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260531184500_add_last_active_sheet_id_to_opportunity_pricing_workbooks.sql",
);

describe("opportunity pricing workbook hardening migration", () => {
  it("suppresses child-sheet visibility when the parent workbook is archived", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain('create policy "Members can view opportunity pricing workbook sheets"');
    expect(sql).toContain("workbook.archived_at is null");
  });

  it("adds atomic workbook mutation rpc functions", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("create or replace function public.save_opportunity_pricing_workbook_active_sheet");
    expect(sql).toContain("create or replace function public.rename_opportunity_pricing_workbook");
    expect(sql).toContain("create or replace function public.duplicate_opportunity_pricing_workbook");
  });

  it("only syncs parent legacy worksheet fields when saving the default sheet", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("v_should_sync_parent boolean := false;");
    expect(sql).toContain("v_should_sync_parent := coalesce(v_target_sheet.is_default, false);");
    expect(sql).toContain("update public.opportunity_pricing_worksheets");
  });

  it("duplicates all child sheets instead of flattening the workbook", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("for v_sheet_record in");
    expect(sql).toContain("'sheets', v_payload_sheets");
  });

  it("adds the transactional page delete rpc with last-page protection", () => {
    const sql = readFileSync(deleteRpcMigrationPath, "utf8");

    expect(sql).toContain("create or replace function public.delete_opportunity_pricing_workbook_sheet");
    expect(sql).toContain("You must keep at least one worksheet page.");
    expect(sql).toContain("if v_deleted_sheet.is_default then");
    expect(sql).toContain("update public.opportunity_pricing_worksheets");
  });

  it("allows a non-admin workbook editor with write access to delete a page", () => {
    const sql = readFileSync(deletePolicyMigrationPath, "utf8");

    expect(sql).toContain('create policy "Privileged members can delete opportunity pricing workbook sheets"');
    expect(sql).toContain("public.has_org_permission(opportunity_pricing_workbook_sheets.organization_id, 'leads.opportunities.write')");
  });

  it("blocks page deletes for users without workbook access", () => {
    const sql = readFileSync(deletePolicyMigrationPath, "utf8");

    expect(sql).toContain("public.is_member_of_organization(opportunity_pricing_workbook_sheets.organization_id)");
    expect(sql).toContain("where workbook.id = opportunity_pricing_workbook_sheets.workbook_id");
  });

  it("blocks page deletes when the parent workbook is archived", () => {
    const sql = readFileSync(deletePolicyMigrationPath, "utf8");

    expect(sql).toContain("workbook.archived_at is null");
  });

  it("keeps the last-page delete guard on the server", () => {
    const sql = readFileSync(deleteRpcMigrationPath, "utf8");

    expect(sql).toContain("You must keep at least one worksheet page.");
  });

  it("adds persistent last active page storage on the workbook parent", () => {
    const sql = readFileSync(lastActiveSheetMigrationPath, "utf8");

    expect(sql).toContain("alter table if exists public.opportunity_pricing_worksheets");
    expect(sql).toContain("add column if not exists last_active_sheet_id uuid");
  });
});
