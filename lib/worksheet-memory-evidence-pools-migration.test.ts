import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("worksheet memory evidence pools migration", () => {
  const sql = readFileSync(
    join(process.cwd(), "supabase/migrations/20260606060000_add_worksheet_memory_evidence_pools.sql"),
    "utf8",
  );

  it("creates pool tables and unique indexes", () => {
    expect(sql).toContain("create table if not exists public.worksheet_memory_evidence_pools");
    expect(sql).toContain("create table if not exists public.worksheet_memory_evidence_pool_events");
    expect(sql).toContain("create unique index if not exists worksheet_memory_evidence_pools_org_signature_uidx");
    expect(sql).toContain("create unique index if not exists worksheet_memory_evidence_pool_events_pool_event_uidx");
  });

  it("defines maturity and evidence role constraints", () => {
    expect(sql).toContain("maturity_status in ('emerging', 'ready_for_synthesis', 'reinforced', 'durable')");
    expect(sql).toContain("evidence_role in ('supporting', 'contradictory', 'ignored')");
  });

  it("locks tables to service_role access under forced rls", () => {
    expect(sql).toContain("alter table public.worksheet_memory_evidence_pools enable row level security;");
    expect(sql).toContain("alter table public.worksheet_memory_evidence_pools force row level security;");
    expect(sql).toContain("alter table public.worksheet_memory_evidence_pool_events enable row level security;");
    expect(sql).toContain("alter table public.worksheet_memory_evidence_pool_events force row level security;");
    expect(sql).toContain("grant select, insert, update on public.worksheet_memory_evidence_pools to service_role;");
    expect(sql).toContain("grant select, insert, update on public.worksheet_memory_evidence_pool_events to service_role;");
  });
});
