import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260818200000_preserve_blank_commercial_item_descriptions.sql",
  "utf8",
);

describe("commercial item blank-description RPC migration", () => {
  it("preserves empty and missing descriptions as the table's non-null empty-string value", () => {
    expect(migration).toContain("create or replace function public.create_commercial_item(p_input jsonb)");
    expect(migration).toContain("coalesce(p_input->>'description', '')");
    expect(migration).not.toContain("nullif(p_input->>'description', '')");
  });

  it("retains the authoritative function security and tenant checks", () => {
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = public");
    expect(migration).toContain("public.has_org_permission(resolved_organization_id, 'leads.opportunities.write')");
    expect(migration).toContain("Project must belong to the same opportunity");
    expect(migration).toContain("Worksheet page not found for organization opportunity");
  });

  it("is a transactional forward replacement without changing the table", () => {
    expect(migration.trimStart().startsWith("begin;")).toBe(true);
    expect(migration.trimEnd().endsWith("commit;")).toBe(true);
    expect(migration).not.toMatch(/alter\s+table\s+public\.commercial_items/i);
    expect(migration).not.toMatch(/drop\s+function/i);
  });
});
