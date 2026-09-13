import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260801150000_add_hosted_development_opportunity_promotion_allowlist.sql",
  "utf8",
);
const stage5 = readFileSync(
  "supabase/migrations/20260801140000_add_local_admin_opportunity_promotion_pilot.sql",
  "utf8",
);
const creationServer = readFileSync("lib/opportunity-creation-server.ts", "utf8");
const conversionServer = readFileSync("lib/leads-clients-server.ts", "utf8");
const rolloutScript = readFileSync(
  "scripts/manage-opportunity-promotion-rollout.mjs",
  "utf8",
);

function body(name: string) {
  const match = migration.match(
    new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\$\\$;`, "i"),
  );
  if (!match) throw new Error(`Missing function ${name}`);
  return match[0];
}

describe("Stage 6 hosted-development allowlist migration", () => {
  it("is a forward additive control extension with no activation or data rewrite", () => {
    expect(migration).toContain("hosted_development_allowlist");
    expect(migration).toContain("hosted_development");
    expect(migration).not.toMatch(/insert\s+into\s+public\.opportunity_lifecycle_rollout_controls/i);
    expect(migration).not.toMatch(/update\s+public\.organization_(opportunities|projects)/i);
    expect(migration).not.toMatch(/delete\s+from|truncate\s|drop\s+table/i);
    expect(stage5).not.toContain("hosted_development_allowlist");
  });

  it("recognizes only exact local and hosted-development scope pairs", () => {
    const predicate = body("is_opportunity_promotion_rollout_scope_v1");
    expect(predicate).toContain("p_pilot_scope = 'local_admin_pilot'");
    expect(predicate).toContain("p_pilot_environment = 'local_development'");
    expect(predicate).toContain("p_pilot_scope = 'hosted_development_allowlist'");
    expect(predicate).toContain("p_pilot_environment = 'hosted_development'");
    expect(predicate).not.toMatch(/production|wildcard|\*/i);
  });

  it("keeps lifecycle strategy server-selected and immutable", () => {
    const creation = body("create_opportunity_workspace_controlled_v1");
    expect(creation).toContain("selected_strategy := 'promote_workspace_v1'");
    expect(creation).toContain("public.is_opportunity_promotion_rollout_scope_v1(");
    expect(creationServer).toContain('"create_opportunity_workspace_controlled_v1"');
    expect(creationServer).not.toMatch(/p_strategy\s*:/);
  });

  it("preserves legacy branching and never falls back from promotion", () => {
    const award = body("award_opportunity_by_lifecycle_v1");
    expect(award).toContain("public.promote_opportunity_workspace_v1(");
    expect(award).toContain("public.convert_accepted_opportunity_to_project(");
    expect(award).toContain("Opportunity promotion award is paused");
    expect(conversionServer).toContain('"award_opportunity_by_lifecycle_v1"');
    expect(conversionServer).not.toContain('"promote_opportunity_workspace_v1"');
  });

  it("keeps browser roles away from controls and the scope helper", () => {
    expect(migration).toContain(
      "revoke all on function public.is_opportunity_promotion_rollout_scope_v1(text, text)\nfrom public, anon, authenticated",
    );
    expect(stage5).toContain(
      "revoke all on public.opportunity_lifecycle_rollout_control_events\nfrom public, anon, authenticated",
    );
  });

  it("requires an exact organization, approved test domain, and admin actor for rollout writes", () => {
    expect(rolloutScript).toContain("Exact organization-name confirmation failed");
    expect(rolloutScript).toContain('"tradesstack.local"');
    expect(rolloutScript).toContain('!["owner", "admin"].includes');
    expect(rolloutScript).toContain('operation === "enable-hosted"');
    expect(rolloutScript).toContain('allowed_strategy: "legacy_two_project_v1"');
  });
});
