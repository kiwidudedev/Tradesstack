import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260829120000_add_project_qa_execution_foundation.sql", "utf8");

function functionBody(name: string, nextName?: string) {
  const start = migration.indexOf(`function public.${name}`);
  const end = nextName ? migration.indexOf(`function public.${nextName}`, start + 1) : migration.length;
  return migration.slice(start, end);
}

describe("Project QA execution migration", () => {
  it("creates typed, tenant-safe run and response aggregates without reusing legacy inspections", () => {
    expect(migration).toContain("create table public.project_qa_runs");
    expect(migration).toContain("create table public.project_qa_responses");
    expect(migration).toMatch(/foreign key \(organization_id, project_id, project_qa_id\)/);
    expect(migration).toMatch(/foreign key \(organization_id, project_id, run_id\)/);
    for (const column of ["text_value", "numeric_value", "boolean_value", "date_value", "inspection_result", "selected_options", "person_user_id", "location_label"]) expect(migration).toContain(column);
    expect(migration).not.toMatch(/(?:alter|drop|truncate|delete\s+from)\s+(?:table\s+)?public\.project_quality_/i);
  });

  it("enforces Make Ready and removes raw Draft to Ready mutation from the save command", () => {
    const makeReady = functionBody("make_project_qa_ready_v1", "save_project_qa_definition_v1");
    expect(makeReady).toContain("'qa.write'");
    expect(makeReady).toContain("qa_row.status <> 'draft'");
    expect(makeReady).toContain("section_count = 0");
    expect(makeReady).toContain("field_count = 0");
    expect(makeReady).toContain("qa_assert_definition(current_sections)");
    expect(makeReady).toContain("Correct invalid measurement limits");
    expect(migration).toContain("rename to save_project_qa_definition_internal_v1");
    expect(migration).toContain("if p_status<>current_status");
  });

  it("starts atomically from Ready with inspect permission, deterministic snapshot hashing, and idempotency", () => {
    const start = functionBody("start_project_qa_run_v1", "save_project_qa_response_v1");
    expect(start).toContain("'qa.inspect'");
    expect(start).toContain("qa_row.status <> 'active'");
    expect(start).toContain("for share");
    expect(start).toContain("qa_row.definition_version");
    expect(start).toContain("jsonb_agg");
    expect(start).toContain("order by s.sort_order,s.id");
    expect(start).toContain("order by f.sort_order,f.id");
    expect(start).toContain("extensions.digest(convert_to(snapshot::text,'UTF8'),'sha256')");
    expect(start).toContain("insert into public.project_qa_responses");
    expect(migration).toContain("unique (organization_id, started_by, start_idempotency_key)");
    expect(start).toContain("on conflict (organization_id,started_by,start_idempotency_key) do nothing");
  });

  it("rejects invalid/stale responses and enforces authoritative completion rules", () => {
    const save = functionBody("save_project_qa_response_v1", "complete_project_qa_run_v1");
    const complete = functionBody("complete_project_qa_run_v1", "list_project_qa_run_summaries_v1");
    expect(save).toContain("response_row.lock_version<>p_expected_lock_version");
    expect(save).toContain("not part of this QA Record snapshot");
    expect(save).toContain("N/A is not allowed");
    expect(save).toContain("Numeric responses must be finite");
    expect(complete).toContain("run_row.lock_version<>p_expected_lock_version");
    expect(complete).toContain("Required QA field");
    expect(complete).toContain("Required % field");
    expect(complete).toContain("requires a comment");
    expect(complete).toContain("blocks QA completion");
    expect(complete).toContain("below its captured minimum");
    expect(complete).toContain("status='completed',completed_by=auth.uid(),completed_at=now()");
  });

  it("makes completed records immutable and exposes read-only RLS plus grouped counts", () => {
    expect(migration).toContain("Completed or cancelled QA Records are immutable");
    expect(migration).toContain("QA response identity and field snapshot are immutable");
    expect(migration).toContain("force row level security");
    expect(migration).toContain("for select to authenticated");
    expect(migration).toContain("grant select on public.project_qa_runs, public.project_qa_responses to authenticated");
    expect(migration).not.toMatch(/grant\s+(insert|update|delete|all)\s+on\s+public\.project_qa_(?:runs|responses)/i);
    const summaries = functionBody("list_project_qa_run_summaries_v1");
    expect(summaries).toContain("count(*) filter(where run.status='in_progress')");
    expect(summaries).toContain("count(*) filter(where run.status='completed')");
  });
});
