import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260715103000_add_xero_phase1_foundation.sql",
);

describe("xero phase 1 foundation migration", () => {
  const sql = readFileSync(migrationPath, "utf8");

  it("creates secure connection and token storage tables", () => {
    expect(sql).toContain("create table if not exists public.organization_xero_connections");
    expect(sql).toContain("create table if not exists public.organization_xero_connection_secrets");
    expect(sql).toContain("create table if not exists public.organization_xero_oauth_states");
    expect(sql).toContain("available_tenants_json jsonb not null default '[]'::jsonb");
    expect(sql).toContain("encrypted_token_set text not null");
  });

  it("adds imported tax rates and durable sync jobs", () => {
    expect(sql).toContain("create table if not exists public.organization_accounting_tax_rates");
    expect(sql).toContain("create table if not exists public.organization_accounting_sync_jobs");
    expect(sql).toContain("job_kind in ('import_accounts', 'import_tax_rates', 'health_check')");
    expect(sql).toContain("queue_state in ('pending', 'claimed', 'retry_scheduled', 'completed', 'dead_lettered')");
  });

  it("protects rows with org-aware RLS and avoids secret grants to authenticated users", () => {
    expect(sql).toContain("alter table public.organization_xero_connections enable row level security;");
    expect(sql).toContain("alter table public.organization_accounting_tax_rates enable row level security;");
    expect(sql).toContain("alter table public.organization_accounting_sync_jobs enable row level security;");
    expect(sql).toContain("public.has_org_permission(organization_xero_connections.organization_id, 'settings.organization.update')");
    expect(sql).toContain("grant select, insert, update, delete on public.organization_xero_connection_secrets to service_role;");
    expect(sql).not.toContain("grant select, insert, update, delete on public.organization_xero_connection_secrets to authenticated;");
  });

  it("adds duplicate prevention indexes for active jobs and org connection scope", () => {
    expect(sql).toContain("constraint organization_xero_connections_org_unique unique (organization_id)");
    expect(sql).toContain("create unique index if not exists organization_accounting_sync_jobs_active_scope_uidx");
    expect(sql).toContain("create unique index if not exists organization_accounting_sync_jobs_idempotency_uidx");
  });
});
