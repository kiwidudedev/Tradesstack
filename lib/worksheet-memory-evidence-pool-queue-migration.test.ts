import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("worksheet memory evidence pool queue migration", () => {
  const sql = readFileSync(
    join(process.cwd(), "supabase/migrations/20260611110000_add_worksheet_memory_evidence_pool_queue.sql"),
    "utf8",
  );
  const fixSql = readFileSync(
    join(process.cwd(), "supabase/migrations/20260611113000_fix_stage6_queue_conflict_target.sql"),
    "utf8",
  );

  it("creates the Stage 6 queue table, indexes, and worker rpc functions", () => {
    expect(sql).toContain("create table if not exists public.worksheet_memory_evidence_pool_queue");
    expect(sql).toContain("create unique index if not exists worksheet_memory_evidence_pool_queue_classification_uidx");
    expect(sql).toContain("on public.worksheet_memory_evidence_pool_queue (organization_id, classification_record_id);");
    expect(sql).not.toContain("where classification_record_id is not null");
    expect(sql).toContain("create or replace function public.enqueue_worksheet_memory_evidence_pool_queue");
    expect(sql).toContain("create or replace function public.claim_worksheet_memory_evidence_pool_batch");
    expect(sql).toContain("create or replace function public.finalize_worksheet_memory_evidence_pool_batch");
  });

  it("adds a corrective migration for already-deployed Stage 6 queue indexes", () => {
    expect(fixSql).toContain("drop index if exists public.worksheet_memory_evidence_pool_queue_classification_uidx;");
    expect(fixSql).toContain("create unique index if not exists worksheet_memory_evidence_pool_queue_classification_uidx");
    expect(fixSql).toContain("on public.worksheet_memory_evidence_pool_queue (organization_id, classification_record_id);");
  });

  it("forces RLS and grants Stage 6 delete access needed for reconciliation", () => {
    expect(sql).toContain("alter table public.worksheet_memory_evidence_pool_queue enable row level security;");
    expect(sql).toContain("alter table public.worksheet_memory_evidence_pool_queue force row level security;");
    expect(sql).toContain("grant select, insert, update on public.worksheet_memory_evidence_pool_queue to service_role;");
    expect(sql).toContain("grant delete on public.worksheet_memory_evidence_pools to service_role;");
    expect(sql).toContain("grant delete on public.worksheet_memory_evidence_pool_events to service_role;");
  });

  it("wires classification completion into Stage 6 queue insertion", () => {
    expect(sql).toContain("insert into public.worksheet_memory_evidence_pool_queue");
    expect(sql).toContain("on conflict (organization_id, classification_record_id) do nothing");
    expect(sql).toContain("if resolved_status in ('classified', 'low_confidence') then");
  });

  it("keeps the conflict target and unique index aligned to prevent the live 42P10 regression", () => {
    expect(sql).toContain("on conflict (organization_id, classification_record_id) do nothing");
    expect(sql).toContain("create unique index if not exists worksheet_memory_evidence_pool_queue_classification_uidx");
    expect(sql).toContain("on public.worksheet_memory_evidence_pool_queue (organization_id, classification_record_id);");
  });
});
