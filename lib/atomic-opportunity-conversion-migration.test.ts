import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260730120000_add_atomic_opportunity_conversion.sql",
  ),
  "utf8",
).toLowerCase();

describe("atomic Opportunity conversion migration", () => {
  it("distinguishes one final Project from the tender workspace", () => {
    expect(sql).toContain("create table if not exists public.opportunity_final_projects");
    expect(sql).toContain("opportunity_id uuid primary key");
    expect(sql).toContain("project_id uuid not null unique");
    expect(sql).toContain("workspace_project_id");
    expect(sql).toContain("target project is not the designated final project");
    expect(sql).toContain("revoke all on public.opportunity_final_projects");
  });

  it("serializes conversion and returns an existing final Project", () => {
    expect(sql).toContain("create or replace function public.convert_accepted_opportunity_to_project");
    expect(sql).toContain("for update;");
    expect(sql).toContain("if existing_final_project_id is not null then");
    expect(sql).toContain("return query");
    expect(sql).toContain("pg_advisory_xact_lock");
  });

  it("validates the exact current Accepted canonical quote", () => {
    expect(sql).toContain("quote.id = p_accepted_quote_id");
    expect(sql).toContain("quote.originating_opportunity_id = p_opportunity_id");
    expect(sql).toContain("accepted_quote_row.status <> 'accepted'");
    expect(sql).toContain("superseded by a newer accepted quote");
    expect(sql).toContain("newer_quote.updated_at > accepted_quote_row.updated_at");
  });

  it("allows only null, workspace, or final-project commercial ownership", () => {
    expect(sql).toContain("quote.project_id not in (workspace_row.id, target_row.id)");
    expect(sql).toContain("line.project_id not in (workspace_row.id, target_row.id)");
    expect(sql).toContain("item.project_id not in (workspace_row.id, target_row.id)");
    expect(sql).toContain("commercial costitems are attached to an unrelated project");
    expect(sql).toContain("quote.project_id = workspace_row.id");
    expect(sql).toContain("item.project_id = workspace_row.id");
  });

  it("commits Project creation, attachment, legacy sync, document linkage, and Won state together", () => {
    const functionStart = sql.indexOf(
      "create or replace function public.convert_accepted_opportunity_to_project",
    );
    const functionSql = sql.slice(functionStart);
    expect(functionSql).toContain("insert into public.organization_projects");
    expect(functionSql).toContain("insert into public.opportunity_final_projects");
    expect(functionSql).toContain("attach_opportunity_commercial_history_to_project");
    expect(functionSql).toContain("sync_opportunity_legacy_quote_on_conversion");
    expect(functionSql).toContain("ensure_opportunity_project_document_workspace");
    expect(functionSql).toContain("converted_project_id = final_project_row.id");
    expect(functionSql).toContain("stage = 'won'");
  });

  it("rejects ambiguous historical delivery candidates rather than creating another suffix", () => {
    expect(sql).toContain("orphan_candidate_count");
    expect(sql).toContain("administrative reconciliation is required");
    expect(sql).toContain("using errcode = 'ts409'");
  });

  it("makes post-commit metadata cloning idempotent", () => {
    expect(sql).toContain("create or replace function public.clone_workspace_metadata_to_project");
    expect(sql).toContain("on conflict (id) do update");
    expect(sql).toContain("insert into public.scope_runs (\n      id,");
  });
});
