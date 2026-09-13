import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260730100000_add_project_document_workspace_resolution.sql",
  ),
  "utf8",
);

describe("Project document workspace resolution migration", () => {
  it("adds viewer resolution, direct Project creation, and conversion linkage RPCs", () => {
    for (const name of [
      "resolve_project_document_workspace",
      "get_or_create_project_document_workspace",
      "ensure_opportunity_project_document_workspace",
    ]) {
      expect(sql).toContain(`create or replace function public.${name}`);
      expect(sql).toContain(`grant execute on function public.${name}`);
    }
  });

  it("uses the existing Opportunity creator and dormant Project-link function", () => {
    expect(sql).toContain(
      "public.get_or_create_opportunity_document_workspace(",
    );
    expect(sql).toContain(
      "public.link_project_to_opportunity_document_workspace(",
    );
  });

  it("separates view access from workspace creation permission", () => {
    expect(sql).toContain(
      "public.has_org_permission(project_row.organization_id, 'files.view')",
    );
    expect(sql).toContain(
      "public.has_org_permission(project_row.organization_id, 'files.write')",
    );
  });

  it("is concurrency-safe and never performs a Storage operation", () => {
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).not.toContain("storage.objects");
    expect(sql).not.toMatch(/\b(copy|move|rename)\b.*\bstorage\b/i);
  });

  it("fixes search paths and denies anonymous execution", () => {
    expect(sql.match(/set search_path = public/g)?.length).toBe(3);
    expect(sql.match(/from public, anon/g)?.length).toBe(3);
  });
});
