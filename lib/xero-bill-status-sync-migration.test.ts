import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/20260718103000_add_xero_bill_status_sync.sql",
  "utf8",
);

describe("Xero Bill status synchronization migration", () => {
  it("adds provider-neutral balances without mutating export snapshots", () => {
    expect(sql).toContain("add column if not exists amount_paid numeric(14,2) null");
    expect(sql).toContain("add column if not exists amount_due numeric(14,2) null");
    expect(sql).not.toMatch(/alter table public\.organization_accounting_document_versions\s+add column/i);
    expect(sql).not.toMatch(/update public\.organization_accounting_document_versions/i);
  });

  it("serializes status updates and rejects stale provider responses", () => {
    expect(sql).toContain("for update;");
    expect(sql).toContain("p_provider_updated_at < v_document.provider_updated_at");
    expect(sql).toContain("'stale', true");
  });

  it("keeps status RPCs service-role only", () => {
    expect(sql).toContain("from public, anon, authenticated");
    expect(sql).toContain("to service_role");
    expect(sql).toContain("set search_path = pg_catalog, public");
  });

  it("records activity only when meaningful state changes", () => {
    expect(sql).toContain("if v_changed then");
    expect(sql).toContain("'xero_bill_status_refreshed'");
    expect(sql).toContain("v_document.amount_paid is distinct from p_amount_paid");
  });
});
