import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/20260723110000_add_retention_capability_cutover_foundation.sql";
const sql = readFileSync(migrationPath, "utf8");
const generatedTypes = readFileSync("lib/supabase/types.ts", "utf8");

const permissionKeys = [
  "retention.view",
  "retention.schedules.manage",
  "retention.schedules.confirm",
  "retention.reminders.manage",
  "retention.claims.create",
  "retention.claims.submit",
  "retention.claims.xero_manage",
  "retention.claims.void_request",
  "retention.claims.void_approve",
  "retention.variances.view",
  "retention.variances.resolve",
  "retention.variances.override",
  "retention.legacy.reconcile",
  "retention.legacy.approve",
  "retention.cutover.manage",
] as const;

describe("Retention Management Phase 1 foundation migration", () => {
  it("adds every approved permission without renaming existing permissions", () => {
    for (const permissionKey of permissionKeys) {
      expect(sql).toContain(`('${permissionKey}'`);
    }
    expect(sql).toContain("role_name in ('owner', 'admin')");
    expect(sql).toContain("('qs', 'retention.view', true)");
    expect(sql).toContain("('project_manager', 'retention.view', true)");
    expect(sql).not.toContain("delete from public.app_permissions");
    expect(sql).not.toContain("delete from public.role_permissions");
  });

  it("creates one normalized capability row per organization, disabled by default", () => {
    expect(sql).toContain("create table public.organization_capabilities");
    expect(sql).toContain("primary key (organization_id, capability_key)");
    expect(sql).toContain("enabled boolean not null default false");
    expect(sql).toContain("'retention_management', false");
    expect(sql).toContain("seed_retention_capability_after_organization_insert");
  });

  it("creates one tenant-consistent legacy workflow state per project", () => {
    expect(sql).toContain("create table public.project_retention_workflow_states");
    expect(sql).toContain("primary key (project_id)");
    expect(sql).toContain("unique (organization_id, project_id)");
    expect(sql).toContain("foreign key (organization_id, project_id)");
    expect(sql).toContain("references public.organization_projects (organization_id, id)");
    expect(sql).toContain("mode text not null default 'legacy'");
    expect(sql).toContain("'legacy', 'observe', 'ready', 'cutover', 'blocked'");
    expect(sql).toContain("seed_retention_workflow_state_after_project_insert");
  });

  it("reserves ready/cutover and implements only the conservative transition matrix", () => {
    expect(sql).toContain("p_new_mode in ('ready', 'cutover')");
    expect(sql).toContain("v_error_code := 'reserved_until_readiness'");
    expect(sql).toContain("v_previous_mode = 'legacy' and p_new_mode = 'observe'");
    expect(sql).toContain("v_previous_mode = 'observe' and p_new_mode = 'legacy'");
    expect(sql).toContain("v_previous_mode = 'observe' and p_new_mode = 'blocked'");
    expect(sql).toContain("v_previous_mode = 'blocked' and p_new_mode = 'observe'");
    expect(sql).toContain("v_error_code := 'capability_disabled'");
  });

  it("uses append-only, non-financial events with server-controlled writes", () => {
    expect(sql).toContain("create table public.retention_capability_events");
    expect(sql).toContain("organization_capability_enabled");
    expect(sql).toContain("organization_capability_disabled");
    expect(sql).toContain("project_mode_changed");
    expect(sql).toContain("project_mode_transition_rejected");
    expect(sql).toContain("management_permission_denied");
    expect(sql).toContain("Retention capability events are append-only.");
    expect(sql).toContain(
      "project_id uuid null references public.organization_projects (id) on delete restrict",
    );
    expect(sql).toContain(
      "revoke insert, update, delete on public.retention_capability_events from authenticated",
    );
    expect(sql).not.toMatch(/\b(amount|balance|retention_withheld_amount|retention_released_amount)\b/i);
  });

  it("exposes only explicit server RPCs and rejects direct authenticated mutations", () => {
    expect(sql).toContain("public.get_organization_retention_capability()");
    expect(sql).toContain("public.set_organization_retention_capability(");
    expect(sql).toContain("public.get_project_retention_workflow_state(");
    expect(sql).toContain("public.transition_project_retention_workflow_mode(");
    expect(sql).toContain("public.get_retention_capability_events(");
    expect(sql).toContain(
      "revoke insert, update, delete on public.organization_capabilities from authenticated",
    );
    expect(sql).toContain(
      "revoke insert, update, delete on public.project_retention_workflow_states from authenticated",
    );
  });

  it("does not mutate or couple to Payment Claim financial records", () => {
    expect(sql).not.toContain("alter table public.project_claims");
    expect(sql).not.toContain("update public.project_claims");
    expect(sql).not.toContain("retention_released_amount");
    expect(sql).not.toContain("organization_accounting_documents");
    expect(sql).not.toContain("organization_accounting_sync_jobs");
    expect(sql).not.toContain("xero.");
    expect(sql).not.toContain("retention_claims");
    expect(sql).not.toContain("retention_claim_allocations");
  });

  it("updates generated types for all Phase 1 tables and public RPCs", () => {
    for (const identifier of [
      "organization_capabilities",
      "project_retention_workflow_states",
      "retention_capability_events",
      "get_organization_retention_capability",
      "set_organization_retention_capability",
      "get_project_retention_workflow_state",
      "transition_project_retention_workflow_mode",
      "get_retention_capability_events",
    ]) {
      expect(generatedTypes).toContain(`${identifier}:`);
    }
  });
});
