import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260729180000_add_document_workspace_listing.sql",
  ),
  "utf8",
);

describe("document workspace listing migration", () => {
  it("adds bounded listing, breadcrumb, and folder-picker RPCs", () => {
    for (const name of [
      "list_document_workspace_nodes",
      "get_document_folder_breadcrumbs",
      "list_document_workspace_folders",
    ]) {
      expect(sql).toContain(`create or replace function public.${name}`);
    }
    expect(sql).toContain("p_limit > 200");
    expect(sql).toContain("limit p_limit");
  });

  it("enforces workspace authorization and active-only reads", () => {
    expect(sql.match(/assert_document_workspace_permission/g)?.length).toBe(3);
    expect(sql).toContain("node.lifecycle_state = 'active'");
    expect(sql).toContain("version.upload_state = 'active'");
    expect(sql).toContain("node.deleted_at is null");
  });

  it("does not generate URLs or access Storage objects", () => {
    expect(sql).not.toContain("storage.objects");
    expect(sql).not.toMatch(/signed[_ ]url/i);
  });

  it("fixes search paths and restricts anonymous execution", () => {
    expect(sql.match(/set search_path = public/g)?.length).toBe(3);
    expect(sql.match(/from public, anon/g)?.length).toBe(3);
  });
});
