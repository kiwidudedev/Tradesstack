import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const overloadCleanup = readFileSync(
  "supabase/migrations/20260405230000_resolve_update_org_settings_rpc_overload.sql",
  "utf8",
);
const canonicalCreation = readFileSync(
  "supabase/migrations/20260405234500_add_bank_account_details_and_canonical_org_settings_rpc.sql",
  "utf8",
);
const upgradeReconciliation = readFileSync(
  "supabase/migrations/20260727171000_reconcile_update_org_settings_rpc_overload.sql",
  "utf8",
);

describe("organization settings RPC migration order", () => {
  it("does not grant the extended signature before the canonical function exists", () => {
    expect(overloadCleanup).not.toContain(
      "grant execute on function public.update_organization_settings(",
    );
    expect(canonicalCreation).toContain(
      "create or replace function public.update_organization_settings(",
    );
    expect(canonicalCreation).toContain(
      "grant execute on function public.update_organization_settings(",
    );
  });

  it("removes the legacy overload for already-upgraded databases", () => {
    expect(upgradeReconciliation).toContain(
      "drop function if exists public.update_organization_settings(uuid, text, text)",
    );
    expect(upgradeReconciliation).not.toContain(
      "create or replace function public.update_organization_settings(",
    );
  });
});
