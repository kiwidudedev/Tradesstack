import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("document storage owner policy migration", () => {
  it("uses the hosted Storage owner_id field and preserves exact reservation authorization", () => {
    const migration = readFileSync(
      "supabase/migrations/20260927100000_fix_document_storage_owner_policy.sql",
      "utf8",
    );

    expect(migration).toContain('bucket_id = \'organization-documents\'');
    expect(migration).toContain("owner_id = (select auth.uid()::text)");
    expect(migration).toContain("public.can_upload_document_storage_object(name)");
    expect(migration).not.toContain("owner = auth.uid()");
  });
});
