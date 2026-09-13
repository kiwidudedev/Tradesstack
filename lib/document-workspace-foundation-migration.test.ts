import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260729150000_add_document_workspace_foundation.sql",
);
const sql = readFileSync(migrationPath, "utf8");

describe("document workspace Phase 1 foundation migration", () => {
  it("creates the shared workspace, typed links, hierarchy, versions, events, and cleanup foundation", () => {
    for (const table of [
      "document_workspaces",
      "document_workspace_entities",
      "document_nodes",
      "document_versions",
      "document_activity_events",
      "document_storage_cleanup_jobs",
    ]) {
      expect(sql).toContain(`create table public.${table}`);
    }
  });

  it("uses typed Opportunity and Project foreign keys and exact-one link enforcement", () => {
    expect(sql).toContain("document_workspace_entities_opportunity_fkey");
    expect(sql).toContain("references public.organization_opportunities (organization_id, id)");
    expect(sql).toContain("document_workspace_entities_project_fkey");
    expect(sql).toContain("references public.organization_projects (organization_id, id)");
    expect(sql).toContain("document_workspace_entities_exactly_one_entity_check");
    expect(sql).toContain("document_workspace_entities_opportunity_uidx");
    expect(sql).toContain("document_workspace_entities_project_uidx");
    expect(sql).not.toMatch(/entity_type\s+text|entity_id\s+uuid/i);
  });

  it("enforces case-insensitive active-name uniqueness at root and child levels", () => {
    expect(sql).toContain(
      "normalized_name text generated always as (lower(btrim(display_name))) stored",
    );
    expect(sql).toContain("document_nodes_active_root_name_uidx");
    expect(sql).toContain("where parent_node_id is null and deleted_at is null");
    expect(sql).toContain("document_nodes_active_child_name_uidx");
    expect(sql).toContain("where parent_node_id is not null and deleted_at is null");
  });

  it("enables and forces RLS on every document table", () => {
    for (const table of [
      "document_workspaces",
      "document_workspace_entities",
      "document_nodes",
      "document_versions",
      "document_activity_events",
      "document_storage_cleanup_jobs",
    ]) {
      expect(sql).toContain(`alter table public.${table} enable row level security;`);
      expect(sql).toContain(`alter table public.${table} force row level security;`);
    }
  });

  it("revokes direct authenticated mutations and keeps cleanup jobs service-only", () => {
    for (const table of [
      "document_workspaces",
      "document_workspace_entities",
      "document_nodes",
      "document_versions",
      "document_activity_events",
      "document_storage_cleanup_jobs",
    ]) {
      expect(sql).toContain(
        `revoke all on public.${table} from public, anon, authenticated;`,
      );
    }

    expect(sql).toContain(
      "grant select, insert, update, delete on public.document_storage_cleanup_jobs to service_role;",
    );
    expect(sql).not.toContain(
      "grant select, insert, update, delete on public.document_storage_cleanup_jobs to authenticated",
    );
  });

  it("makes document activity append-only", () => {
    expect(sql).toContain("create trigger document_activity_events_append_only");
    expect(sql).toContain("before update or delete on public.document_activity_events");
    expect(sql).toContain("Document activity events are append-only.");
  });

  it("defines the required transactional hierarchy RPCs and dormant Project-link RPC", () => {
    for (const fn of [
      "get_or_create_opportunity_document_workspace",
      "link_project_to_opportunity_document_workspace",
      "create_document_folder",
      "rename_document_node",
      "move_document_node",
      "soft_delete_document_node",
      "restore_document_node",
    ]) {
      expect(sql).toContain(`function public.${fn}`);
    }

    expect(sql).toContain("with recursive descendants as");
    expect(sql).toContain("with recursive subtree as");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).not.toMatch(/storage\.objects|storage\.buckets|storage\.copy|storage\.from/i);
  });

  it("sets a safe search path on every security-definer function", () => {
    const securityDefinerFunctions = sql
      .split("create or replace function ")
      .slice(1)
      .filter((definition) => definition.includes("security definer"));

    expect(securityDefinerFunctions.length).toBeGreaterThanOrEqual(9);
    for (const definition of securityDefinerFunctions) {
      expect(definition).toContain("set search_path = public");
    }
  });

  it("seeds the smallest role matrix and keeps purge owner-only", () => {
    for (const permission of [
      "files.view",
      "files.write",
      "files.delete",
      "files.purge",
    ]) {
      expect(sql).toContain(`'${permission}'`);
    }

    expect(sql).toContain("('owner', 'files.purge', true)");
    expect(sql).toContain("('admin', 'files.purge', false)");
    expect(sql).toContain("('qs', 'files.delete', false)");
    expect(sql).toContain("('worker', 'files.view', false)");
  });
});
