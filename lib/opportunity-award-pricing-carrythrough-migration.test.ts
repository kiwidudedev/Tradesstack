import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  new URL("../supabase/migrations/20260819130000_add_atomic_opportunity_award_pricing_carrythrough.sql", import.meta.url),
  "utf8",
);
const foundationSql = readFileSync(
  new URL("../supabase/migrations/20260819120000_add_opportunity_award_pricing_foundation.sql", import.meta.url),
  "utf8",
);

describe("atomic Opportunity award pricing carry-through", () => {
  it("roots the source set in accepted quote commercial links", () => {
    expect(sql).toContain("mapping.accepted_quote_id = p_accepted_quote_id");
    expect(sql).toContain("link.document_id = p_accepted_quote_id");
    expect(sql).toContain("item.source_workbook_id");
    expect(sql).not.toMatch(/order by\s+workbook\.updated_at/i);
  });

  it("fails closed for unresolved or broken source lineage", () => {
    expect(sql).toContain("pricing_source_kind = 'unresolved'");
    expect(sql).toContain("Accepted quote pricing basis requires reconciliation before award");
    expect(sql).toContain("Accepted quote pricing basis contains broken worksheet lineage");
  });

  it("creates one working successor revision and deterministic clone identities", () => {
    expect(sql).toContain("accepted_quote.revision_number + 1");
    expect(sql).toContain("'project_working'");
    expect(sql).toContain("md5(resolved_manifest_id::text || ':workbook:'");
    expect(sql).toContain("md5(resolved_manifest_id::text || ':sheet:'");
    expect(foundationSql).toContain("opportunity_pricing_worksheets_quote_source_clone_unique");
  });

  it("preserves full workbook pages, formulas, and immutable material evidence", () => {
    expect(sql).toContain("source_sheet.worksheet_data");
    expect(sql).toContain("source_sheet.pricing_summary");
    expect(sql).toContain("source_sheet.extracted_pricing_data");
    expect(sql).toContain("material_bindings_snapshot");
    expect(sql).toContain("regenerate_worksheet_material_binding_ids");
  });

  it("integrates after canonical quote attachment for both conversion strategies", () => {
    expect(sql).toContain("after update of project_id on public.project_quotes");
    expect(sql).toContain("public.finalize_opportunity_award_pricing_v1");
  });

  it("locks the accepted quote and original source workbooks only after evidence and clones exist", () => {
    const sourceInsert = sql.indexOf("insert into public.opportunity_award_pricing_manifest_sources");
    const workbookLock = sql.indexOf("set award_locked_at = timezone('utc', now()),\n      award_locked_reason = 'accepted_tender_basis'");
    const quoteLock = sql.indexOf("award_locked_reason = 'opportunity_award'");
    expect(sourceInsert).toBeGreaterThan(-1);
    expect(workbookLock).toBeGreaterThan(sourceInsert);
    expect(quoteLock).toBeGreaterThan(workbookLock);
  });
});
