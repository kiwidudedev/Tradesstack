import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260606014500_harden_incremental_worksheet_pricing_pattern_processing_queue.sql",
);

describe("worksheet pricing pattern evidence processing queue migration", () => {
  it("adds lease and retry fields plus dead-letter status", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("add column if not exists attempt_count integer not null default 0");
    expect(sql).toContain("add column if not exists max_attempts integer not null default 5");
    expect(sql).toContain("add column if not exists claimed_at timestamptz null");
    expect(sql).toContain("add column if not exists claim_expires_at timestamptz null");
    expect(sql).toContain("add column if not exists claimed_by text null");
    expect(sql).toContain("add column if not exists claim_token uuid null");
    expect(sql).toContain("add column if not exists last_error_code text null");
    expect(sql).toContain("add column if not exists last_error_message text null");
    expect(sql).toContain("processing_status in ('pending', 'claimed', 'processed', 'retry_scheduled', 'dead_lettered')");
  });

  it("keeps enqueue/backfill idempotent by source event and classification version", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("create or replace function public.enqueue_worksheet_pricing_pattern_evidence_processing");
    expect(sql).toContain("on conflict (source_event_id, classification_version) do update");
    expect(sql).toContain("classification_record_id = coalesce(excluded.classification_record_id");
  });

  it("claims rows atomically so concurrent runners cannot take the same evidence row", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("create or replace function public.claim_worksheet_pricing_pattern_evidence_processing_batch");
    expect(sql).toContain("for update skip locked");
    expect(sql).toContain("attempt_count = q.attempt_count + 1");
    expect(sql).toContain("claim_token = gen_random_uuid()");
    expect(sql).toContain("processing_status = 'claimed'");
  });

  it("reclaims expired claims and respects retry_after before retrying", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("q.processing_status = 'retry_scheduled'");
    expect(sql).toContain("q.retry_after is null or q.retry_after <= now()");
    expect(sql).toContain("q.processing_status = 'claimed'");
    expect(sql).toContain("q.claim_expires_at is null or q.claim_expires_at <= now()");
  });

  it("finalizes rows as processed, retry-scheduled, or dead-lettered", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("create or replace function public.finalize_worksheet_pricing_pattern_evidence_processing_batch");
    expect(sql).toContain("processing_status = 'processed'");
    expect(sql).toContain("processing_status = 'retry_scheduled'");
    expect(sql).toContain("processing_status = 'dead_lettered'");
    expect(sql).toContain("queue_row.attempt_count >= queue_row.max_attempts");
  });
});
