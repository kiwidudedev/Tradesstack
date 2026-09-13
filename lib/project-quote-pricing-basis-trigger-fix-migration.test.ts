import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260819170000_fix_project_quote_pricing_basis_trigger_record_shape.sql",
  "utf8",
);

describe("Project Quote pricing-basis trigger record shape fix", () => {
  it("only reads workbook_id from sheet trigger records", () => {
    expect(migration).toContain("if tg_table_name = 'opportunity_pricing_workbook_sheets' then");
    expect(migration).toContain("to_jsonb(new)->>'workbook_id'");
    expect(migration).toContain("target_workbook_id := new.id");
    expect(migration).not.toContain(
      "case when tg_table_name = 'opportunity_pricing_workbook_sheets' then new.workbook_id",
    );
  });
});
