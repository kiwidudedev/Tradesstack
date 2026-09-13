import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260819160000_add_project_quote_revision_creation.sql",
  "utf8",
);

describe("Project Quote successor revision creation", () => {
  it("serializes and idempotently reuses a predecessor successor", () => {
    expect(migration).toContain("for update;");
    expect(migration).toContain("quote.predecessor_quote_id = p_predecessor_quote_id");
    expect(migration).toContain("return query select existing_successor.id");
  });

  it("uses formal lineage rather than quote-number parsing", () => {
    expect(migration).toContain("predecessor_quote_id, revision_number");
    expect(migration).toContain("resolved_revision_number := predecessor.revision_number + 1");
  });

  it("clones lines, commercial links, workbook pages, formulas, and material metadata", () => {
    expect(migration).toContain("insert into public.project_quote_line_items");
    expect(migration).toContain("insert into public.commercial_item_document_links");
    expect(migration).toContain("insert into public.opportunity_pricing_workbook_sheets");
    expect(migration).toContain("regenerate_worksheet_material_binding_ids");
  });

  it("scopes revision creation to an organization and Project", () => {
    expect(migration).toContain("quote.organization_id = p_organization_id");
    expect(migration).toContain("quote.project_id = p_project_id");
    expect(migration).toContain("has_org_permission(p_organization_id, 'quotes.write')");
  });
});
