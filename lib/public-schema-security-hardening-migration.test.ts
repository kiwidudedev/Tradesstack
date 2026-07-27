import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260727180000_harden_financial_routing_and_intelligence_access.sql",
);
const migration = fs.readFileSync(migrationPath, "utf8");

describe("public schema security hardening migration", () => {
  it("enables and forces RLS on all four advisory tables", () => {
    for (const table of [
      "organization_tradesstack_accounting_mappings",
      "tradesstack_financial_routing_codes",
      "cost_construction_intelligence_events",
      "cost_construction_intelligence_queue",
    ]) {
      expect(migration).toContain(`alter table public.${table}\n  enable row level security`);
      expect(migration).toContain(`alter table public.${table}\n  force row level security`);
    }
  });

  it("keeps accounting mappings tenant-scoped and browser read-only", () => {
    expect(migration).toContain("public.is_member_of_organization(");
    expect(migration).toContain(
      "grant select on table public.organization_tradesstack_accounting_mappings\n  to authenticated",
    );
    expect(migration).not.toMatch(
      /grant\s+(?:insert|update|delete)[^;]*organization_tradesstack_accounting_mappings[^;]*authenticated/i,
    );
  });

  it("keeps routing codes globally readable but immutable to browser roles", () => {
    expect(migration).toContain("using ((select auth.role()) = 'authenticated')");
    expect(migration).toContain(
      "grant select on table public.tradesstack_financial_routing_codes\n  to authenticated",
    );
    expect(migration).not.toMatch(
      /grant\s+(?:insert|update|delete)[^;]*tradesstack_financial_routing_codes[^;]*authenticated/i,
    );
  });

  it("keeps intelligence tables and worker RPCs service-only", () => {
    for (const table of [
      "cost_construction_intelligence_events",
      "cost_construction_intelligence_queue",
    ]) {
      expect(migration).toContain(
        `revoke all on table public.${table}\n  from public, anon, authenticated`,
      );
    }

    for (const fn of [
      "enqueue_cost_construction_intelligence_event(jsonb)",
      "claim_cost_construction_intelligence_batch(integer, uuid, text, integer)",
      "finalize_cost_construction_intelligence_batch(jsonb)",
    ]) {
      expect(migration).toContain(`revoke all on function public.${fn}`);
      expect(migration).toContain(`grant execute on function public.${fn}`);
    }
  });

  it("makes the observability view invoker-safe and service-only", () => {
    expect(migration).toContain(
      "alter view public.intelligence_observability_pricing_worksheet_daily\n  set (security_invoker = true)",
    );
    expect(migration).toContain(
      "revoke all on table public.intelligence_observability_pricing_worksheet_daily\n  from public, anon, authenticated",
    );
    expect(migration).toContain(
      "grant select on table public.intelligence_observability_pricing_worksheet_daily\n  to service_role",
    );
  });

  it("contains no blanket all-row policy", () => {
    expect(migration).not.toMatch(/for all/i);
    expect(migration).not.toMatch(/using\s*\(\s*true\s*\)/i);
    expect(migration).not.toMatch(/with check\s*\(\s*true\s*\)/i);
  });
});
