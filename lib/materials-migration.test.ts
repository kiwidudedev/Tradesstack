import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260615103000_add_material_library_v1.sql"
);

describe("material library v1 migration", () => {
  it("creates the core material, supplier price, and import staging tables", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("create table if not exists public.organization_materials");
    expect(sql).toContain("create table if not exists public.organization_material_supplier_prices");
    expect(sql).toContain("create table if not exists public.organization_material_import_batches");
    expect(sql).toContain("create table if not exists public.organization_material_import_rows");
  });

  it("adds materials permissions, RLS, and storage policies", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("('materials.view', 'View company material library and import review batches')");
    expect(sql).toContain("('materials.write', 'Create, update, archive, import, and manage company materials')");
    expect(sql).toContain('create policy "Members can view organization materials"');
    expect(sql).toContain("insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)");
    expect(sql).toContain("material-library-imports");
  });

  it("enforces current-price and preferred-price uniqueness", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("create unique index if not exists organization_material_supplier_prices_current_key");
    expect(sql).toContain("create unique index if not exists organization_material_supplier_prices_preferred_key");
    expect(sql).toContain("where is_current = true and is_preferred = true");
  });
});
