import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260606003000_add_worksheet_event_classification_queue.sql",
);

describe("worksheet event classification queue migration", () => {
  it("adds a queue table with one row per source event and classification version", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("create table if not exists public.worksheet_event_classification_queue");
    expect(sql).toContain("queue_state in ('pending', 'claimed', 'retry_scheduled', 'completed', 'dead_lettered')");
    expect(sql).toContain("create unique index if not exists worksheet_event_classification_queue_source_version_idx");
    expect(sql).toContain("on public.worksheet_event_classification_queue (source_event_id, classification_version)");
    expect(sql).toContain("revoke all on public.worksheet_event_classification_queue from public, anon, authenticated;");
    expect(sql).toContain("grant select, insert, update on public.worksheet_event_classification_queue to service_role;");
  });

  it("backfills and enqueues classification work idempotently", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("create or replace function public.enqueue_worksheet_event_classification_queue");
    expect(sql).toContain("on conflict (source_event_id, classification_version) do nothing");
    expect(sql).toContain("when ee.classification_status in ('classified', 'low_confidence') then 'completed'");
    expect(sql).toContain("when ee.classification_status = 'failed' and coalesce(ee.attempt_number, 0) >= 5 then 'dead_lettered'");
    expect(sql).toContain("when ee.classification_status = 'failed' then 'retry_scheduled'");
  });

  it("claims rows atomically and prevents two workers from claiming the same row", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("create or replace function public.claim_worksheet_event_classification_batch");
    expect(sql).toContain("for update of q skip locked");
    expect(sql).toContain("attempt_count = q.attempt_count + 1");
    expect(sql).toContain("'attemptNumber', c.attempt_number");
    expect(sql).toContain("'claimToken', c.claim_token");
  });

  it("reclaims expired leases and scopes claims by organization", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("or q.claim_expires_at <= now()");
    expect(sql).toContain("(p_organization_id is null or q.organization_id = p_organization_id)");
    expect(sql).toContain("claim_expires_at = now() + make_interval(secs => resolved_lease_seconds)");
  });

  it("finalizes claimed attempts into immutable history and moves failed rows to retry or dead letter", () => {
    const sql = readFileSync(migrationPath, "utf8");
    const stage6Sql = readFileSync(
      resolve(
        process.cwd(),
        "supabase/migrations/20260611110000_add_worksheet_memory_evidence_pool_queue.sql",
      ),
      "utf8",
    );

    expect(sql).toContain("create or replace function public.finalize_worksheet_event_classification_claims");
    expect(sql).toContain("and q.claim_token = resolved_claim_token");
    expect(sql).toContain("and q.attempt_count = resolved_attempt_number");
    expect(sql).toContain("select public.record_worksheet_event_classifications(jsonb_build_array(input_item))");
    expect(sql).toContain("queue_state = 'completed'");
    expect(sql).toContain("queue_state = 'retry_scheduled'");
    expect(sql).toContain("queue_state = 'dead_lettered'");
    expect(stage6Sql).toContain("insert into public.worksheet_memory_evidence_pool_queue");
    expect(stage6Sql).toContain("on conflict (organization_id, classification_record_id) do nothing");
  });

  it("keeps attempt history immutable and conflict-safe for replayed finalize calls", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("on conflict (source_event_id, classification_version, attempt_number) do nothing");
    expect(sql).toContain("where c.source_event_id = resolved_source_event_id");
    expect(sql).toContain("and c.classification_version = resolved_classification_version");
    expect(sql).toContain("and c.attempt_number = resolved_attempt_number");
  });
});
