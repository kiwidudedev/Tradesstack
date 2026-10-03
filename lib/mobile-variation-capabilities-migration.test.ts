import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const sql = readFileSync(
  new URL("../supabase/migrations/20261003160000_add_mobile_project_variation_capabilities_v1.sql", import.meta.url),
  "utf8",
);

describe("mobile Variation capabilities migration", () => {
  it("derives create capability from project membership and the authoritative permission", () => {
    expect(sql).toContain("get_mobile_project_variation_capabilities_v1");
    expect(sql).toContain("resolve_mobile_project_member_context_v2(p_project_id)");
    expect(sql).toContain("has_org_permission(current_context.organization_id, 'variations.write')");
    expect(sql).toContain("can_write, can_write, can_write");
  });

  it("does not expose public or anonymous execution", () => {
    expect(sql).toContain("from public, anon");
    expect(sql).toContain("to authenticated");
  });
});
