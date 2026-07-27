import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260615150000_add_material_classification_foundations.sql"
);

describe("material classification migration", () => {
  it("adds shared classification fields to organization materials", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("alter table public.organization_materials");
    expect(sql).toContain("add column if not exists work_type text null");
    expect(sql).toContain("add column if not exists needs_review boolean not null default false");
    expect(sql).toContain("add column if not exists original_classification jsonb null");
    expect(sql).toContain("add column if not exists final_classification jsonb null");
    expect(sql).toContain("add column if not exists confirmed_by_user_id uuid null references auth.users");
  });

  it("adds provisional classification fields to import rows", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("alter table public.organization_material_import_rows");
    expect(sql).toContain("add column if not exists classified_work_type text null");
    expect(sql).toContain("add column if not exists classified_cost_type text null");
    expect(sql).toContain("add column if not exists classified_cost_code text null");
    expect(sql).toContain("add column if not exists classified_needs_review boolean not null default false");
    expect(sql).toContain("add column if not exists classified_organization_cost_code_id uuid null references public.organization_cost_codes");
  });
});
