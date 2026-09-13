import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/20260801170000_add_xero_reconnect_recovery.sql", import.meta.url),
  "utf8",
);

describe("Xero reconnect recovery migration", () => {
  it("adds a durable service-role-only attempt lifecycle without deleting history", () => {
    expect(migration).toContain("add column if not exists correlation_id uuid null");
    expect(migration).toContain("'redirect_issued'");
    expect(migration).toContain("'callback_received'");
    expect(migration).toContain("'completed'");
    expect(migration).toContain("'expired'");
    expect(migration).toContain("'cancelled'");
    expect(migration).toContain("'failed'");
    expect(migration).toContain("function public.protect_xero_oauth_attempt_identity");
    expect(migration).toContain("xero oauth attempt identity is immutable");
    expect(migration).toContain("invalid xero oauth attempt status transition");
    expect(migration).not.toMatch(/delete\s+from\s+public\.organization_xero_oauth_states/i);
    const schemaSection = migration.split("create or replace function public.finalize_xero_oauth_attempt")[0] ?? migration;
    expect(schemaSection).not.toMatch(/update\s+public\.organization_xero_oauth_states\s+set\s+status/i);
  });

  it("atomically persists the token secret, connection, and attempt completion", () => {
    expect(migration).toContain("function public.finalize_xero_oauth_attempt");
    expect(migration).toContain("insert into public.organization_xero_connection_secrets");
    expect(migration).toContain("update public.organization_xero_connections");
    expect(migration).toContain("update public.organization_xero_oauth_states");
    expect(migration).toContain("status = 'completed'");
    expect(migration).toContain("to service_role");
    expect(migration).toContain("from public, anon, authenticated");
  });
});
