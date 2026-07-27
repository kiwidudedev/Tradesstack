import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/20260606070000_add_worksheet_memory_semantic_pools.sql",
  "utf8",
);
const neutralSql = readFileSync(
  "supabase/migrations/20260606081500_refactor_semantic_pools_to_neutral_domains.sql",
  "utf8",
);
const correctnessSql = readFileSync(
  "supabase/migrations/20260611123000_fix_stage7_semantic_pool_correctness.sql",
  "utf8",
);

describe("worksheet memory semantic pools migration", () => {
  it("adds the semantic pool queue, runs, pools, and event tables with RLS", () => {
    expect(sql).toContain("create table if not exists public.worksheet_memory_semantic_pool_queue");
    expect(sql).toContain("create table if not exists public.worksheet_memory_semantic_pool_runs");
    expect(sql).toContain("create table if not exists public.worksheet_memory_semantic_pools");
    expect(sql).toContain("create table if not exists public.worksheet_memory_semantic_pool_events");
    expect(sql).toContain("alter table public.worksheet_memory_semantic_pool_queue enable row level security;");
    expect(sql).toContain("alter table public.worksheet_memory_semantic_pool_queue force row level security;");
    expect(sql).toContain("alter table public.worksheet_memory_semantic_pools enable row level security;");
    expect(sql).toContain("alter table public.worksheet_memory_semantic_pools force row level security;");
    expect(sql).toContain("revoke all on public.worksheet_memory_semantic_pool_queue from public, anon, authenticated;");
    expect(sql).toContain("grant select, insert, update on public.worksheet_memory_semantic_pool_queue to service_role;");
  });

  it("keeps queueing idempotent by organization, seed pool, and seed pool revision hash", () => {
    expect(sql).toContain("create unique index if not exists worksheet_memory_semantic_pool_queue_seed_revision_uidx");
    expect(sql).toContain("on public.worksheet_memory_semantic_pool_queue (organization_id, seed_pool_id, seed_pool_revision_hash)");
    expect(sql).toContain("create or replace function public.enqueue_worksheet_memory_semantic_pool_queue");
  });

  it("adds claim and finalize RPCs with claim tokens, lease expiry, retry, and dead-letter handling", () => {
    expect(sql).toContain("create or replace function public.claim_worksheet_memory_semantic_pool_batch");
    expect(sql).toContain("claim_expires_at <= now()");
    expect(sql).toContain("claim_token = gen_random_uuid()");
    expect(sql).toContain("create or replace function public.finalize_worksheet_memory_semantic_pool_batch");
    expect(sql).toContain("queue_state = 'completed'");
    expect(sql).toContain("queue_state = 'retry_scheduled'");
    expect(sql).toContain("queue_state = 'dead_lettered'");
    expect(sql).toContain("queue_row.attempt_count >= queue_row.max_attempts");
  });

  it("stores semantic pools and links them back to source events and classifications", () => {
    expect(sql).toContain("semantic_signature text not null");
    expect(sql).toContain("create unique index if not exists worksheet_memory_semantic_pools_org_signature_uidx");
    expect(sql).toContain("source_event_id uuid not null references public.intelligence_events (id) on delete cascade");
    expect(sql).toContain("classification_record_id uuid null references public.worksheet_event_classifications (id) on delete set null");
    expect(sql).toContain("create unique index if not exists worksheet_memory_semantic_pool_events_pool_event_uidx");
    expect(sql).toContain("on public.worksheet_memory_semantic_pool_events (semantic_pool_id, source_event_id)");
  });

  it("adds neutral evidence-domain fields and neutral event-link roles", () => {
    expect(neutralSql).toContain("add column if not exists domain_label text null");
    expect(neutralSql).toContain("add column if not exists domain_summary text null");
    expect(neutralSql).toContain("add column if not exists grouping_rationale text null");
    expect(neutralSql).toContain("add column if not exists variant_summary text null");
    expect(neutralSql).toContain("add column if not exists included_count integer not null default 0");
    expect(neutralSql).toContain("add column if not exists adjacent_count integer not null default 0");
    expect(neutralSql).toContain("evidence_role in ('included', 'excluded', 'adjacent', 'uncertain')");
    expect(neutralSql).toContain("when 'supporting' then 'included'");
    expect(neutralSql).toContain("when 'contradictory' then 'uncertain'");
    expect(neutralSql).toContain("when 'ignored' then 'excluded'");
  });

  it("adds atomic semantic pool membership replacement for Stage 7 rewrites", () => {
    expect(correctnessSql).toContain("create or replace function public.replace_worksheet_memory_semantic_pool_events");
    expect(correctnessSql).toContain("delete from public.worksheet_memory_semantic_pool_events");
    expect(correctnessSql).toContain("insert into public.worksheet_memory_semantic_pool_events");
    expect(correctnessSql).toContain("grant execute on function public.replace_worksheet_memory_semantic_pool_events(uuid, uuid, jsonb) to service_role");
  });
});
