import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const identityHardeningMigration = resolve(
  process.cwd(),
  "supabase/migrations/20260531201500_add_pricing_worksheet_ai_identity_db.sql",
);

describe("pricing worksheet ai identity migrations", () => {
  it("makes pricing worksheet memory derivation page-aware", () => {
    const sql = readFileSync(identityHardeningMigration, "utf8");

    expect(sql).toContain("metadata->>'workbookId'");
    expect(sql).toContain("metadata->>'sheetId'");
    expect(sql).toContain("metadata->>'sheetName'");
    expect(sql).toContain("'workbookId', candidate.workbook_id");
    expect(sql).toContain("'sheetId', candidate.sheet_id");
    expect(sql).toContain("'sheetName', candidate.sheet_name");
    expect(sql).toContain("'distinctSheetCount', candidate.distinct_sheet_count");
    expect(sql).toContain("and r.save_count >= 2");
  });

  it("exposes workbook and sheet identity in pricing worksheet observability", () => {
    const sql = readFileSync(identityHardeningMigration, "utf8");

    expect(sql).toContain("as workbook_id");
    expect(sql).toContain("as sheet_id");
    expect(sql).toContain("as sheet_name");
    expect(sql).toContain("group by 1, 2, 3, 4, 5, 6, 7");
  });
});
