import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/20260613123000_add_deterministic_memory_retirement_queue.sql",
  "utf8",
);

describe("organization memory retirement queue migration", () => {
  it("adds the retirement queue table with claimable state and org-scoped uniqueness", () => {
    expect(sql).toContain("create table if not exists public.organization_memory_retirement_queue");
    expect(sql).toContain("queue_state in ('pending', 'claimed', 'retry_scheduled', 'completed', 'dead_lettered')");
    expect(sql).toContain("create unique index if not exists organization_memory_retirement_queue_org_memory_uidx");
    expect(sql).toContain("create index if not exists organization_memory_retirement_queue_claimable_idx");
    expect(sql).toContain("alter table public.organization_memory_retirement_queue enable row level security;");
    expect(sql).toContain("alter table public.organization_memory_retirement_queue force row level security;");
    expect(sql).toContain("grant select, insert, update on public.organization_memory_retirement_queue to service_role;");
  });

  it("adds enqueue, claim, and finalize retirement RPCs with retry and dead-letter support", () => {
    expect(sql).toContain("create or replace function public.enqueue_organization_memory_retirement_queue");
    expect(sql).toContain("create or replace function public.claim_organization_memory_retirement_batch");
    expect(sql).toContain("perform public.enqueue_organization_memory_retirement_queue(");
    expect(sql).toContain("claim_token = gen_random_uuid()");
    expect(sql).toContain("create or replace function public.finalize_organization_memory_retirement_batch");
    expect(sql).toContain("queue_state = 'retry_scheduled'");
    expect(sql).toContain("queue_state = 'dead_lettered'");
    expect(sql).toContain("last_no_action_reason");
  });

  it("adds DB-level retirement lifecycle basis uniqueness", () => {
    expect(sql).toContain("create unique index if not exists omlh_org_memory_retirement_basis_uidx");
    expect(sql).toContain("on public.organization_memory_lifecycle_history");
    expect(sql).toContain("lifecycle_event_type = 'memory_retired'");
    expect(sql).toContain("lifecycle_metadata ->> 'retirementBasisHash'");
  });
});
