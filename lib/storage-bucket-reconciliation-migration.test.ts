import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260927110000_reconcile_required_storage_buckets.sql",
  "utf8",
);

describe("required Storage bucket reconciliation migration", () => {
  it("reconciles every required dedicated-client bucket", () => {
    for (const bucket of [
      "project-drawing-sets",
      "project-variation-attachments",
      "project-quality-photos",
      "supplier-invoice-documents",
      "task-attachments",
      "material-library-imports",
      "retention-claim-documents",
      "project-qa-evidence",
      "organization-logos",
    ]) {
      expect(migration).toContain(`('${bucket}', '${bucket}'`);
    }
  });

  it("reasserts the direct member/admin policy contracts without editing history", () => {
    expect(migration).toContain("Members can read project drawing storage objects");
    expect(migration).toContain("Members can upload project drawing storage objects");
    expect(migration).toContain("Admins can delete project drawing storage objects");
    expect(migration).toContain("Members can read task attachment storage objects");
    expect(migration).toContain("Members can read supplier invoice document storage objects");
    expect(migration).toContain("Members can read material import storage objects");
    expect(migration).toContain("Admins can upload organization logo storage objects");
    expect(migration).toContain("on conflict (id) do update");
    expect(migration).not.toContain("alter migration");
  });
});
