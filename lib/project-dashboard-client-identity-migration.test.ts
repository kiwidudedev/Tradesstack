import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261003120000_fix_project_dashboard_client_identity.sql"),
  "utf8"
);

describe("project dashboard client identity migration", () => {
  it("preserves the existing aggregate and canonicalizes the company label", () => {
    expect(migration).toContain(
      "public.get_project_dashboard_aggregate_before_xero_claim_payment("
    );
    expect(migration).toContain("c.company_name");
    expect(migration).toContain("c.name");
    expect(migration).toContain("nullif(btrim(v_company_name), '')");
    expect(migration).toContain("'{project,clientName}'");
    expect(migration).toContain("grant execute on function public.get_project_dashboard_aggregate(");
  });
});
