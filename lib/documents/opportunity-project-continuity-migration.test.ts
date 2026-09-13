import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260821120000_harden_opportunity_project_document_continuity.sql",
  ),
  "utf8",
);

describe("Opportunity and Project document continuity migration", () => {
  it("allows view-only resolution while keeping creation behind files.write", () => {
    expect(migration).toContain("resolve_opportunity_document_workspace");
    expect(migration).toContain("'files.view'");
    expect(migration).toContain("'files.write'");
    expect(migration).toContain("get_document_workspace_capabilities");
  });

  it("wraps both legacy conversion and lifecycle award in the same transactional invariant", () => {
    expect(migration).toContain(
      "rename to convert_accepted_opportunity_to_project_without_document_guard",
    );
    expect(migration).toContain(
      "rename to award_opportunity_by_lifecycle_v1_without_document_invariant",
    );
    expect(migration.match(/ensure_opportunity_project_document_workspace/g)?.length).toBeGreaterThanOrEqual(2);
    expect(migration).not.toContain("document_versions\n  select");
  });
});
