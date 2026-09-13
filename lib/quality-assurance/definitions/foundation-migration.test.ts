import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260828120000_add_qa_definition_foundation.sql",
  "utf8",
);

describe("QA definition foundation migration", () => {
  it("adds the permission catalog and enforces organization plus project access", () => {
    for (const permission of [
      "qa.templates.view", "qa.templates.write", "qa.view", "qa.write",
      "qa.inspect", "qa.verify", "qa.signoff",
    ]) expect(migration).toContain(`'${permission}'`);
    expect(migration).toContain("public.has_org_permission(p_organization_id, p_permission_key)");
    expect(migration).toContain("public.project_members pm");
    expect(migration).toContain("om.user_id = auth.uid()");
  });

  it("uses tenant-safe relational entities and prevents cross-organization child reassignment", () => {
    for (const table of [
      "qa_templates", "qa_template_sections", "qa_template_fields", "qa_template_field_options",
      "project_qas", "project_qa_sections", "project_qa_fields", "project_qa_field_options",
    ]) expect(migration).toContain(`create table public.${table}`);
    expect(migration).toMatch(/foreign key \(organization_id,\s*template_id\)/);
    expect(migration).toMatch(/foreign key \(organization_id,\s*project_id,\s*project_qa_id\)/);
    expect(migration).toContain("force row level security");
  });

  it("keeps all browser writes behind narrow security-definer commands", () => {
    expect(migration).toContain("revoke all on public.qa_templates");
    expect(migration).toContain("grant select on public.qa_templates");
    expect(migration).not.toMatch(/grant\s+(insert|update|delete|all)\s+on\s+public\.qa_/i);
    expect(migration).toContain("security definer");
  });

  it("copies template definitions atomically with fresh identities and immutable copied rows", () => {
    const copyStart = migration.indexOf("create or replace function public.create_project_qa_from_template_v1");
    const copyEnd = migration.indexOf("create or replace function public.save_project_qa_definition_v1", copyStart);
    const copy = migration.slice(copyStart, copyEnd);
    expect(copy).toContain("new_section := gen_random_uuid()");
    expect(copy).toContain("new_field := gen_random_uuid()");
    expect(copy).toContain("insert into public.project_qa_field_options");
    expect(copy).toContain("source_template_version");
    expect(copy).toContain("source.name");
    expect(copy).not.toMatch(/update\s+public\.qa_template_/i);
    expect(copy).not.toMatch(/project_qa_fields[\s\S]*references\s+public\.qa_template_fields/i);
  });

  it("leaves the operational legacy QA schema untouched", () => {
    expect(migration).not.toMatch(/(?:alter|drop|truncate|delete\s+from)\s+(?:table\s+)?public\.project_quality_/i);
  });
});
