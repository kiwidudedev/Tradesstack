import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260606033000_add_per_mutation_evidence_v2_outbox.sql",
);

describe("worksheet mutation Evidence V2 outbox migration", () => {
  const sql = readFileSync(migrationPath, "utf8").toLowerCase();

  it("creates a unique outbox row per organization and client mutation id", () => {
    expect(sql).toContain("create table if not exists public.worksheet_mutation_evidence_v2_outbox");
    expect(sql).toContain("client_mutation_id text not null");
    expect(sql).toContain("create unique index if not exists worksheet_mutation_evidence_v2_outbox_org_client_mutation_idx");
    expect(sql).toContain("on public.worksheet_mutation_evidence_v2_outbox (organization_id, client_mutation_id)");
  });

  it("adds claim and retry queue fields with dead-letter support", () => {
    expect(sql).toContain("processing_status text not null default 'pending'");
    expect(sql).toContain("attempt_count integer not null default 0");
    expect(sql).toContain("max_attempts integer not null default 5");
    expect(sql).toContain("claim_token uuid null");
    expect(sql).toContain("retry_after timestamptz null");
    expect(sql).toContain("dead_lettered_at timestamptz null");
    expect(sql).toContain("'dead_lettered'");
  });

  it("adds enqueue, claim, finalize, and service-role write RPCs", () => {
    expect(sql).toContain("create or replace function public.enqueue_worksheet_mutation_evidence_v2_outbox");
    expect(sql).toContain("create or replace function public.claim_worksheet_mutation_evidence_v2_outbox_batch");
    expect(sql).toContain("create or replace function public.finalize_worksheet_mutation_evidence_v2_outbox_batch");
    expect(sql).toContain("create or replace function public.write_worksheet_mutation_outbox_intelligence_events");
  });

  it("preserves edit-event idempotency by selecting existing source_request_id rows after conflict", () => {
    expect(sql).toContain("and e.source_request_id = resolved_source_request_id");
    expect(sql).toContain("on conflict do nothing");
    expect(sql).toContain("create unique index if not exists intelligence_events_pricing_worksheet_correction_source_request_idx");
  });
});
