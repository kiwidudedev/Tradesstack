import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260801140000_add_local_admin_opportunity_promotion_pilot.sql",
  "utf8",
);
const foundation = readFileSync(
  "supabase/migrations/20260731100000_add_dormant_opportunity_promotion_foundation.sql",
  "utf8",
);
const creationServer = readFileSync("lib/opportunity-creation-server.ts", "utf8");
const conversionServer = readFileSync("lib/leads-clients-server.ts", "utf8");
const creationContract = readFileSync("lib/opportunity-creation-contract.ts", "utf8");

function body(name: string) {
  const match = migration.match(
    new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\$\\$;`, "i"),
  );
  if (!match) throw new Error(`Missing function ${name}`);
  return match[0];
}

describe("Stage 5 local administrator pilot migration", () => {
  it("is additive, default-off, organization-scoped, and does not seed activation", () => {
    expect(migration).toContain("pilot_scope text not null default 'disabled'");
    expect(migration).toContain("pilot_environment text not null default 'disabled'");
    expect(migration).toContain("local_admin_pilot");
    expect(migration).toContain("local_development");
    expect(migration).not.toMatch(
      /insert\s+into\s+public\.opportunity_lifecycle_rollout_controls/i,
    );
  });

  it("selects creation strategy only inside the trusted controlled RPC", () => {
    const controlled = body("create_opportunity_workspace_controlled_v1");
    expect(controlled).toContain("selected_strategy := 'promote_workspace_v1'");
    expect(controlled).toContain("selected_strategy := 'legacy_two_project_v1'");
    expect(creationServer).toContain('"create_opportunity_workspace_controlled_v1"');
    expect(creationServer).not.toMatch(/p_strategy\s*:/);
    expect(creationContract).not.toMatch(/^\s*strategy\??:/m);
  });

  it("branches awards only by immutable lifecycle strategy and never falls back for promotion", () => {
    const award = body("award_opportunity_by_lifecycle_v1");
    expect(award).toContain("lifecycle_row.strategy = 'promote_workspace_v1'");
    expect(award).toContain("public.promote_opportunity_workspace_v1(");
    expect(award).toContain("public.convert_accepted_opportunity_to_project(");
    expect(award).toContain("Opportunity promotion pilot award is paused");
    expect(conversionServer).toContain('"award_opportunity_by_lifecycle_v1"');
    expect(conversionServer).not.toContain('"promote_opportunity_workspace_v1"');
    expect(award).toContain("p_correlation_id text");
    expect(award).toContain("md5(p_correlation_id)::uuid");
  });

  it("keeps the legacy shadow ledger quiet for active promotion lifecycles", () => {
    const capture = body("capture_opportunity_promotion_shadow_v2");
    expect(capture).toContain(
      "evaluation.lifecycle_strategy is distinct from 'legacy_two_project_v1'",
    );
    expect(capture).toContain("return query select null::uuid, false, false");
  });

  it("does not insert, clone, copy, rename, or invoke Xero in the promotion branch", () => {
    const award = body("award_opportunity_by_lifecycle_v1");
    const promotionBranch = award.slice(
      award.indexOf("if lifecycle_row.strategy = 'promote_workspace_v1' then"),
      award.indexOf("if lifecycle_row.id is not null and lifecycle_row.strategy <> 'legacy_two_project_v1'"),
    );
    expect(promotionBranch).not.toContain("insert into public.organization_projects");
    expect(promotionBranch).not.toContain("clone_workspace_metadata_to_project");
    expect(promotionBranch).not.toMatch(/storage|xero/i);
  });

  it("keeps controls and audit evidence inaccessible to browser roles", () => {
    expect(migration).toContain(
      "revoke all on public.opportunity_lifecycle_rollout_control_events\nfrom public, anon, authenticated",
    );
    expect(migration).toContain("to service_role");
    expect(foundation).toContain("prevent_opportunity_promotion_event_update");
  });

  it("records immutable contractual totals, currency, structure and a SHA-256 hash", () => {
    const trigger = body("validate_opportunity_promotion_event_insert");
    expect(trigger).toContain("new.contract_subtotal := quote_row.subtotal");
    expect(trigger).toContain("new.contract_total := quote_row.total_quote_price");
    expect(trigger).toContain("new.structural_evidence := evidence_value");
    expect(trigger).toContain("extensions.digest");
  });
});
