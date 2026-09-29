import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260801160000_add_default_opportunity_lifecycle_policy.sql",
  "utf8",
);
const stage6 = readFileSync(
  "supabase/migrations/20260801150000_add_hosted_development_opportunity_promotion_allowlist.sql",
  "utf8",
);
const creationServer = readFileSync("lib/opportunity-creation-server.ts", "utf8");
const conversionServer = readFileSync("lib/leads-clients-server.ts", "utf8");
const policyScript = readFileSync(
  "scripts/manage-opportunity-lifecycle-default.mjs",
  "utf8",
);

function body(name: string) {
  const match = migration.match(
    new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\$\\$;`, "i"),
  );
  if (!match) throw new Error(`Missing function ${name}`);
  return match[0];
}

describe("Stage 7 default Opportunity lifecycle migration", () => {
  it("installs a dormant policy without rewriting or activating lifecycle data", () => {
    expect(migration).toContain("create table public.opportunity_lifecycle_default_policy");
    expect(migration).toContain("create table public.opportunity_lifecycle_default_policy_events");
    expect(migration).not.toMatch(/insert\s+into\s+public\.opportunity_lifecycle_default_policy\s*\(/i);
    expect(migration).not.toMatch(/update\s+public\.(opportunity_lifecycles|organization_opportunities|organization_projects)/i);
    expect(migration).not.toMatch(/delete\s+from|truncate\s|drop\s+table/i);
    expect(stage6).not.toContain("opportunity_lifecycle_default_policy");
  });

  it("enforces one trusted environment policy and audits every policy mutation", () => {
    expect(migration).toContain("singleton boolean primary key default true");
    expect(migration).toContain("check (environment in ('local_development', 'hosted_development'))");
    expect(migration).toContain("check (default_strategy in ('legacy_two_project_v1', 'promote_workspace_v1'))");
    expect(migration).toContain("after insert or update or delete");
    expect(migration).toContain("force row level security");
    expect(migration).toContain("from public, anon, authenticated");
  });

  it("uses exact active organization override before the effective default", () => {
    const creation = body("create_opportunity_workspace_controlled_v1");
    expect(creation).toContain("is_opportunity_lifecycle_override_active_v1");
    expect(creation.indexOf("select * into override_row")).toBeLessThan(
      creation.indexOf("select * into default_row"),
    );
    expect(creation).toContain("effective_from <= now()");
    expect(creation).toContain("selected_strategy := 'promote_workspace_v1'");
    expect(creation).toContain("selected_strategy := 'legacy_two_project_v1'");
  });

  it("keeps strategy out of browser input and immutable after creation", () => {
    expect(creationServer).toContain("getCurrentOrganizationMember");
    expect(creationServer).toContain("legacy-compatibility");
    expect(creationServer).not.toMatch(/p_strategy\s*:/);
    expect(migration).not.toMatch(/update\s+public\.opportunity_lifecycles/i);
    expect(migration).not.toMatch(/strategy\s*=\s*default_row/i);
  });

  it("authorizes promotion execution from policy without inferring award strategy", () => {
    const award = body("award_opportunity_by_lifecycle_v1");
    expect(award).toContain("if lifecycle_row.strategy = 'promote_workspace_v1'");
    expect(award).toContain("Opportunity promotion award is paused");
    expect(award).toContain("public.promote_opportunity_workspace_v1(");
    expect(award).toContain("public.convert_accepted_opportunity_to_project(");
    expect(conversionServer).toContain('"award_opportunity_by_lifecycle_v1"');
    expect(conversionServer).not.toContain('"promote_opportunity_workspace_v1"');
  });

  it("requires a trusted development administrator to change the default", () => {
    expect(policyScript).toContain("mvxyxvrxaorzglppxzzz");
    expect(policyScript).toContain("@tradesstack.local");
    expect(policyScript).toContain('["owner", "admin"]');
    expect(policyScript).toContain('operation === "activate-promotion"');
    expect(policyScript).toContain('default_strategy: "legacy_two_project_v1"');
  });
});
