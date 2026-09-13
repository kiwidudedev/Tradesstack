import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260802120000_correct_promoted_project_metadata.sql",
  "utf8",
);
const proxy = readFileSync("proxy.ts", "utf8");
const middleware = readFileSync("lib/supabase/middleware.ts", "utf8");
const bucklandsReconciliation = readFileSync(
  "scripts/reconciliation/reconcile-bucklands-promoted-project-metadata.sql",
  "utf8",
);

describe("promoted Project metadata correction", () => {
  it("keeps identity fields and legacy conversion outside the correction", () => {
    const cleanup = migration.match(
      /create or replace function public\.clean_same_project_promotion_metadata_v1[\s\S]*?\$\$;/i,
    )?.[0] ?? "";

    expect(cleanup).toContain("update public.organization_projects");
    expect(cleanup).toContain("project.name = opportunity_row.name || ' Tender Workspace'");
    expect(cleanup).toContain("slug = candidate_slug");
    expect(cleanup).not.toMatch(/project_code\s*=/i);
    expect(cleanup).not.toMatch(/source_opportunity_id\s*=/i);
    expect(cleanup).not.toMatch(/stage\s*=/i);
    expect(migration).not.toContain("convert_accepted_opportunity_to_project(");
    expect(migration).not.toMatch(/insert\s+into\s+public\.organization_projects/i);
  });

  it("uses the Opportunity slug, a serialized organization namespace, and stable numeric suffixes", () => {
    expect(migration).toContain("nullif(btrim(opportunity_row.slug), '')");
    expect(migration).toContain(":project-slug-namespace");
    expect(migration).toContain("project.id <> project_row.id");
    expect(migration).toContain("alias.project_id <> project_row.id");
    expect(migration).toContain("candidate_slug := base_slug || '-' || suffix::text");
    expect(migration).toContain("suffix integer := 2");
  });

  it("makes aliases organization-scoped, immutable, and unable to shadow canonical slugs", () => {
    expect(migration).toContain("organization_project_slug_aliases_org_slug_uidx");
    expect(migration).toContain("Project slug alias conflicts with an active Project slug");
    expect(migration).toContain("Project slug conflicts with a stored Project slug alias");
    expect(migration).toContain("Project slug aliases are immutable");
    expect(migration).toContain("force row level security");
  });

  it("returns the post-trigger slug from the public promotion RPC on first call and retry", () => {
    expect(migration).toContain("rename to promote_opportunity_workspace_core_v1");
    expect(migration).toContain("join public.organization_projects project");
    expect(migration).toContain("project.slug");
    expect(migration).toContain("promoted.promotion_completed");
  });

  it("permanently redirects old deep links while preserving suffix paths and query strings", () => {
    expect(middleware).toContain("resolve_project_slug_alias_v1");
    expect(proxy).toContain("segments[3] = encodeURIComponent(projectSlugRedirect)");
    expect(proxy).toContain("NextResponse.redirect(redirectUrl, 308)");
    expect(proxy).not.toContain("redirectUrl.search =");
  });

  it("keeps the Bucklands correction approval-gated and identity-guarded", () => {
    expect(migration).not.toContain("a0f2bec6-1c9d-4438-a898-41a4d67c2f17");
    expect(bucklandsReconciliation).toContain("This is intentionally not a migration");
    expect(bucklandsReconciliation).toContain("project_row.project_code <> '26030'");
    expect(bucklandsReconciliation).toContain("project.id <> project_row.id");
    expect(bucklandsReconciliation).toContain("Bucklands post-update identity verification failed");
    expect(bucklandsReconciliation).not.toMatch(/update\s+public\.organization_opportunities/i);
  });
});
