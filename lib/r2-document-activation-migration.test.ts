import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20261010120000_add_r2_document_activation.sql"), "utf8");

describe("R2 document activation migration", () => {
  it("keeps R2 activation behind Supabase authorization and immutable metadata", () => {
    expect(migration).toContain("create or replace function public.complete_document_upload_r2");
    expect(migration).toContain("public.has_org_permission(version_row.organization_id, 'files.write')");
    expect(migration).toContain("p_actual_size <> version_row.byte_size");
    expect(migration).toContain("document_upload_mime_extension_allowed");
    expect(migration).toContain("grant execute on function public.complete_document_upload_r2");
  });
});
