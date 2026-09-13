import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260730110000_complete_document_storage_lifecycle.sql",
);
const sql = fs.readFileSync(migrationPath, "utf8").toLowerCase();

describe("document storage lifecycle migration", () => {
  it("adds recycle, cleanup-batch, reconciliation, and usage foundations", () => {
    expect(sql).toContain("create table public.organization_document_storage_usage");
    expect(sql).toContain("create table public.document_storage_cleanup_batches");
    expect(sql).toContain("create table public.document_storage_reconciliation_findings");
    expect(sql).toContain("create or replace function public.list_deleted_document_batches");
    expect(sql).toContain("create or replace function public.purge_document_node");
  });

  it("forces RLS and keeps operational tables service-only", () => {
    for (const table of [
      "organization_document_storage_usage",
      "document_storage_cleanup_batches",
      "document_storage_reconciliation_findings",
    ]) {
      expect(sql).toContain(`alter table public.${table} enable row level security`);
      expect(sql).toContain(`alter table public.${table} force row level security`);
      expect(sql).toMatch(
        new RegExp(`revoke all on public\\.${table}[\\s\\S]*?from public, anon, authenticated`),
      );
    }
    expect(sql).toContain("to service_role");
  });

  it("uses leased service-role cleanup with retry and dead-letter states", () => {
    expect(sql).toContain("claim_document_storage_cleanup_jobs");
    expect(sql).toContain("for update skip locked");
    expect(sql).toContain("claim_expires_at <= now()");
    expect(sql).toContain("complete_document_storage_cleanup_job");
    expect(sql).toContain("fail_document_storage_cleanup_job");
    expect(sql).toContain("power(2, least(job_row.attempt_count, 10))");
    expect(sql).toContain("dead_lettered");
  });

  it("enforces quota transactionally before pending version insertion", () => {
    expect(sql).toContain("create trigger enforce_document_storage_quota");
    expect(sql).toContain("before insert on public.document_versions");
    expect(sql).toContain("'document-storage-quota:' || new.organization_id::text");
    expect(sql).toContain("document storage quota exceeded");
  });

  it("keeps purge asynchronous and reconciliation non-destructive", () => {
    const purgeStart = sql.indexOf("create or replace function public.purge_document_node");
    const purgeEnd = sql.indexOf(
      "create or replace function public.claim_document_storage_cleanup_jobs",
    );
    const purgeSql = sql.slice(purgeStart, purgeEnd);
    expect(purgeSql).toContain("insert into public.document_storage_cleanup_jobs");
    expect(purgeSql).not.toContain("storage.objects");
    expect(sql).toContain("'destructiverepairallowed',");
    expect(sql).toContain("false");
  });

  it("adds bounded indexes for large deleted sets and version catalogs", () => {
    expect(sql).toContain("document_versions_storage_reconciliation_idx");
    expect(sql).toContain("document_nodes_deleted_batch_root_idx");
    expect(sql).toContain("document_storage_cleanup_jobs_batch_idx");
    expect(sql).toContain("p_limit > 5000");
    expect(sql).toContain("p_limit > 500");
  });

  it("sets a safe search_path on every security-definer function", () => {
    const functions = sql.split("create or replace function ").slice(1);
    for (const fn of functions) {
      if (fn.includes("security definer")) {
        expect(fn.slice(0, fn.indexOf("as $$"))).toContain("set search_path =");
      }
    }
  });
});
