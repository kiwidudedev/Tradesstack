import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260715195500_harden_xero_phase1_security_and_identity.sql",
);

describe("xero phase 1 hardening migration", () => {
  const sql = readFileSync(migrationPath, "utf8");

  it("locks down secret and oauth state tables to service_role only", () => {
    expect(sql).toContain("alter table public.organization_xero_connection_secrets enable row level security;");
    expect(sql).toContain("alter table public.organization_xero_oauth_states enable row level security;");
    expect(sql).toContain("revoke all on public.organization_xero_connection_secrets from authenticated;");
    expect(sql).toContain("revoke all on public.organization_xero_oauth_states from authenticated;");
    expect(sql).toContain('create policy "Service role can manage xero connection secrets"');
    expect(sql).toContain('create policy "Service role can manage xero oauth states"');
  });

  it("adds the attention_required status for connection remediation flows", () => {
    expect(sql).toContain("'attention_required'");
  });
});
