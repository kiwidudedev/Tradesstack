import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260728130000_add_supplier_bill_ucl_container_storage.sql",
  ),
  "utf8",
);

describe("Supplier Bill UCL container storage migration", () => {
  it("creates immutable validated versions with identity and payload limits", () => {
    expect(migration).toContain("create table if not exists public.supplier_bill_ucl_container_versions");
    expect(migration).toContain("schema_version = 'supplier_bill.v2'");
    expect(migration).toContain("container_type = 'supplier_invoice'");
    expect(migration).toContain("payload_bytes between 1 and 65536");
    expect(migration).toContain(
      "unique (organization_id, container_type, source_id, schema_version, content_hash)",
    );
    expect(migration).toContain("before update or delete");
    expect(migration).toContain("Supplier Bill UCL container versions are immutable");
  });

  it("extends Phase 4 current state into a single constrained current pointer", () => {
    expect(migration).toContain("alter table public.supplier_bill_ucl_current_state");
    expect(migration).toContain("current_version_id uuid null");
    expect(migration).toContain("supplier_bill_ucl_current_state_current_version_fkey");
    expect(migration).toContain("context_status in ('current', 'voided')");
    expect(migration).toContain("context_status = 'deleted'");
    expect(migration).toContain("current_version_id is null");
  });

  it("atomically persists or reuses a version and rejects stale pointer movement", () => {
    expect(migration).toContain("create or replace function public.persist_supplier_bill_ucl_container");
    expect(migration).toContain("for update");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("on conflict (organization_id, container_type, source_id, schema_version, content_hash)");
    expect(migration).toContain("staleWriteRejected");
    expect(migration).toContain("p_latest_dependency_updated_at < current_row.latest_dependency_updated_at");
    expect(migration).toContain("p_content_hash < current_row.content_hash");
    expect(migration).toContain("queue_state = 'leased'");
    expect(migration).toContain("q.lease_token = p_lease_token");
  });

  it("tombstones current state without deleting immutable history", () => {
    expect(migration).toContain("create or replace function public.delete_supplier_bill_ucl_current_container");
    expect(migration).toContain("current_version_id = null");
    expect(migration).toContain("context_status = 'deleted'");
    expect(migration).not.toMatch(/delete from public\.supplier_bill_ucl_container_versions/i);
  });

  it("supports a proven same-ID lifecycle reappearing without discarding prior history", () => {
    expect(migration).toContain("deleted_at = null");
    expect(migration).toContain("current_version_id = excluded.current_version_id");
    expect(migration).toContain("supplier_bill_ucl_container_versions_identity_uidx");
    expect(migration).not.toMatch(/truncate table public\.supplier_bill_ucl_container_versions/i);
  });

  it("uses forced RLS and exposes payload storage only to service_role", () => {
    expect(migration).toContain("force row level security");
    expect(migration).toContain(
      "revoke all on public.supplier_bill_ucl_container_versions from public, anon, authenticated",
    );
    expect(migration).toContain(
      "grant select, insert on public.supplier_bill_ucl_container_versions to service_role",
    );
    expect(migration).not.toMatch(/grant select[^;]+supplier_bill_ucl_container_versions[^;]+authenticated/i);
    expect(migration).toContain(
      "grant execute on function public.persist_supplier_bill_ucl_container",
    );
  });

  it("adds exact lookup indexes and preview-only bounded retention", () => {
    expect(migration).toContain("supplier_bill_ucl_current_org_source_idx");
    expect(migration).toContain("supplier_bill_ucl_current_org_supplier_idx");
    expect(migration).toContain("supplier_bill_ucl_current_org_status_idx");
    expect(migration).toContain("supplier_bill_ucl_current_project_ids_gin_idx");
    expect(migration).toContain("supplier_bill_ucl_versions_content_hash_idx");
    expect(migration).toContain("preview_supplier_bill_ucl_container_retention");
    expect(migration).toContain("interval '90 days'");
    expect(migration).toContain("r.version_rank > 25");
    expect(migration).toContain("cardinality(r.milestone_codes) = 0");
    expect(migration).not.toMatch(/create trigger[^;]*(purge|cleanup|retention)/i);
  });

  it("extends metadata-only operations with safe storage diagnostics", () => {
    expect(migration).toContain("staleWriteRejectedCount");
    expect(migration).toContain("versionCount");
    expect(migration).toContain("currentPointerCount");
    expect(migration).toContain("persistedPayloadBytes");
    expect(migration).toContain("currentStatusCounts");
    expect(migration).not.toMatch(/jsonb_build_object\([^;]*payload_json/is);
  });

  it("contains no model, search, embedding, vector, or memory integration", () => {
    expect(migration).not.toMatch(/anthropic|openai|embedding|vector|memory_action|learning_review_queue/i);
  });
});
