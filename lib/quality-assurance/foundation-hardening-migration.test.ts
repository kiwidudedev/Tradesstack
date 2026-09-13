import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260906120000_harden_qa_foundation_concurrency_and_legacy_isolation.sql",
  "utf8",
);

function body(start: string, end: string) {
  return migration.slice(migration.indexOf(start), migration.indexOf(end, migration.indexOf(start)));
}

describe("QA foundation hardening migration", () => {
  it("makes both definition save boundaries require an expected version under a row lock", () => {
    const template = body("create function public.save_qa_template_definition_v1", "drop function public.save_project_qa_definition_v1");
    const project = body("create function public.save_project_qa_definition_v1", "revoke all on function public.save_qa_template_definition_v1");
    for (const definitionSave of [template, project]) {
      expect(definitionSave).toContain("p_expected_version integer");
      expect(definitionSave).toContain("for update");
      expect(definitionSave).toContain("definition_version is distinct from p_expected_version");
      expect(definitionSave).toContain("updated by someone else");
    }
    expect(migration).toContain("save_qa_template_definition_internal_v1");
    expect(migration).toContain("save_project_qa_definition_internal_v1");
    expect(migration).toMatch(/revoke all on function public\.save_qa_template_definition_internal_v1[\s\S]*authenticated/);
  });

  it("uses an atomic run-lock compare-and-swap for cancellation", () => {
    const cancel = body("create function public.cancel_project_qa_run_v1", "revoke all on function public.cancel_project_qa_run_v1");
    expect(cancel).toContain("p_expected_lock_version integer");
    expect(cancel).toContain("target.lock_version = p_expected_lock_version");
    expect(cancel).toContain("target.lock_version + 1");
    expect(cancel).toContain("changed since you opened it");
  });

  it("moves every live legacy QA table from organization-only RLS to canonical project access", () => {
    for (const table of [
      "project_quality_issues", "project_quality_issue_photos", "project_quality_issue_comments",
      "project_quality_issue_activity", "project_quality_inspections", "project_quality_inspection_items",
      "project_quality_inspection_activity", "project_quality_photos", "project_quality_work_proofs",
      "project_quality_work_proof_checklist_items", "project_quality_sign_offs",
      "project_quality_sign_off_work_proofs", "project_quality_signoff_activity",
    ]) expect(migration).toContain(`'${table}'`);
    expect(migration).toContain("public.can_access_qa_project(organization_id, project_id, ''qa.view'')");
    expect(migration).toContain("public.can_access_qa_project(organization_id, project_id, ''qa.inspect'')");
    expect(migration).toContain("public.can_access_project_member_v1(organization_id, project_id)");
  });

  it("enforces project/organization identity for parent and child relationships without rewriting old data", () => {
    expect(migration).toContain("project_quality_issue_comments_issue_scope_fkey");
    expect(migration).toContain("project_quality_inspection_items_inspection_scope_fkey");
    expect(migration).toContain("project_quality_signoff_links_proof_scope_fkey");
    expect(migration).toContain("project_job_todos_issue_scope_fkey");
    expect(migration).toContain("not valid");
    expect(migration).not.toMatch(/(?:delete|update)\s+from\s+public\.project_quality_/i);
    expect(migration).not.toMatch(/drop trigger[^;]*(?:sync_project_todo_from_quality_issue|sync_project_todo_from_inspection_item)/i);
  });
});
