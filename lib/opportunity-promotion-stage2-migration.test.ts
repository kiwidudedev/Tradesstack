import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260731110000_add_opportunity_lifecycle_compatibility_readers.sql",
  "utf8",
);

function source(path: string) {
  return readFileSync(path, "utf8");
}

describe("Stage 2 Opportunity lifecycle compatibility migration", () => {
  it("adds one lifecycle authority for classification, visibility, baseline, and eligibility", () => {
    expect(migration).toContain(
      "function public.classify_opportunity_lifecycle_v1",
    );
    expect(migration).toContain(
      "function public.resolve_project_lifecycle_v1",
    );
    expect(migration).toContain(
      "function public.get_visible_project_ids_v1",
    );
    expect(migration).toContain(
      "function public.resolve_project_contractual_baseline_v1",
    );
    expect(migration).toContain(
      "function public.is_project_delivery_eligible_v1",
    );
  });

  it("requires explicit immutable evidence for same-Project promotion", () => {
    expect(migration).toContain("lifecycle_row.strategy = 'promote_workspace_v1'");
    expect(migration).toContain("event_row.lifecycle_id = lifecycle_row.id");
    expect(migration).toContain(
      "event_row.accepted_quote_id = mapping_row.accepted_quote_id",
    );
    expect(migration).toContain("'future_awarded_promotion'");
    expect(migration).toContain("'invalid_or_ambiguous'");
  });

  it("introduces no live lifecycle or rollout activation", () => {
    expect(migration).not.toMatch(
      /insert\s+into\s+public\.opportunity_lifecycle_rollout_controls/i,
    );
    expect(migration).not.toMatch(
      /insert\s+into\s+public\.opportunity_lifecycles/i,
    );
    expect(migration).not.toMatch(
      /insert\s+into\s+public\.opportunity_promotion_events/i,
    );
    expect(migration).not.toContain("promotion_enabled = true");
    expect(migration).not.toContain("creation_enabled = true");
  });

  it("leaves active creation and award on their current paths", () => {
    for (const path of [
      "app/app/(workspace)/leads-clients/opportunities/NewOpportunityDialog.tsx",
      "app/app/(workspace)/leads-clients/opportunities/new/page.tsx",
    ]) {
      expect(source(path)).not.toContain("create_opportunity_workspace_v1");
    }

    const awardRoute = source(
      "app/api/leads-clients/opportunities/[opportunitySlug]/convert/route.ts",
    );
    expect(awardRoute).toContain("convertOpportunityToProject");
    expect(awardRoute).not.toContain("promote_opportunity_workspace_v1");
  });

  it("does not mutate identifiers, storage, Xero workers, or clone paths", () => {
    expect(migration).not.toMatch(
      /update\s+public\.organization_(projects|opportunities)/i,
    );
    expect(migration).not.toMatch(
      /insert\s+into\s+public\.(organization_projects|organization_opportunities)/i,
    );
    expect(migration).not.toMatch(/\b(storage_path|project_code|slug)\b/i);
    expect(migration).not.toMatch(/\b(clone|copy)\b/i);
    expect(migration).not.toMatch(
      /(create|alter|update|insert\s+into)\s+public\.[a-z0-9_]*xero/i,
    );
  });

  it("keeps compatibility changes out of presentation and navigation sources", () => {
    const changedPresentationNames = [
      "ProjectLayoutShell",
      "ProjectSecondaryNav",
      "OpportunityWorkspaceShell",
      "Sidebar",
      "Topbar",
    ];
    for (const name of changedPresentationNames) {
      expect(migration).not.toContain(name);
    }

    expect(source("lib/projects-server.ts")).toContain(
      "getVisibleProjectIds",
    );
    expect(source("lib/project-work-context-server.ts")).toContain(
      "workspace_project_id === project.id",
    );
  });
});
