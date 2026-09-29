import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/20260926100000_fix_organization_logo_storage_policy_scope.sql", import.meta.url),
  "utf8",
);

describe("organization logo storage policy migration", () => {
  it("qualifies the storage object path inside organization subqueries", () => {
    expect(migration).toContain("split_part(storage.objects.name, '/', 1)");
    expect(migration).toContain("string_to_array(storage.objects.name, '/')");
    expect(migration).not.toContain("split_part(o.name, '/', 1)");
  });

  it("keeps organization-scoped permission checks on all write policies", () => {
    expect(migration.match(/has_org_permission\(o\.id, 'settings\.organization\.update'\)/g)).toHaveLength(4);
  });
});
