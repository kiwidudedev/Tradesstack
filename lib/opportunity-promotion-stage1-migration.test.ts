import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/20260731100000_add_dormant_opportunity_promotion_foundation.sql";
const migration = readFileSync(migrationPath, "utf8");
const previousMigration = readFileSync(
  "supabase/migrations/20260730120000_add_atomic_opportunity_conversion.sql",
  "utf8",
);

function functionBodyFrom(source: string, name: string) {
  const start = source.indexOf(`create or replace function public.${name}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const bodyStart = source.indexOf("as $$", start);
  const bodyEnd = source.indexOf("$$;", bodyStart);
  expect(bodyStart).toBeGreaterThan(start);
  expect(bodyEnd).toBeGreaterThan(bodyStart);
  return source.slice(bodyStart, bodyEnd);
}

function functionBody(name: string) {
  return functionBodyFrom(migration, name);
}

describe("Stage 1 dormant Opportunity promotion migration", () => {
  it("adds immutable lifecycle and event structures without a backfill", () => {
    expect(migration).toContain("create table public.opportunity_lifecycles");
    expect(migration).toContain("create table public.opportunity_promotion_events");
    expect(migration).toContain("opportunity_lifecycles_opportunity_unique");
    expect(migration).toContain("opportunity_lifecycles_workspace_unique");
    expect(migration).toContain("opportunity_lifecycles_org_request_unique");
    expect(migration).toContain("prevent_opportunity_lifecycle_update");
    expect(migration).toContain("prevent_opportunity_lifecycle_delete");
    expect(
      migration.match(/insert\s+into\s+public\.opportunity_lifecycles/gi),
    ).toHaveLength(1);
    expect(functionBody("create_opportunity_workspace_v1")).toContain(
      "insert into public.opportunity_lifecycles",
    );
  });

  it("keeps both entry points dormant behind empty rollout controls", () => {
    expect(migration).toContain(
      "create table public.opportunity_lifecycle_rollout_controls",
    );
    expect(migration).not.toMatch(
      /insert\s+into\s+public\.opportunity_lifecycle_rollout_controls/i,
    );
    expect(functionBody("create_opportunity_workspace_v1")).toContain(
      "rollout_row.creation_enabled is not true",
    );
    expect(functionBody("promote_opportunity_workspace_v1")).toContain(
      "rollout_row.promotion_enabled is not true",
    );
  });

  it("makes creation atomic and request-idempotent", () => {
    const body = functionBody("create_opportunity_workspace_v1");
    expect(body).toContain("pg_advisory_xact_lock");
    expect(body).toContain("lifecycle.creation_request_id = p_creation_request_id");
    expect(body).toContain("insert into public.organization_opportunities");
    expect(body).toContain("insert into public.organization_projects");
    expect(body).toContain("source_opportunity_id");
    expect(body).toContain("insert into public.opportunity_lifecycles");
  });

  it("proves promotion does not create, copy, clone, or call Xero", () => {
    const body = functionBody("promote_opportunity_workspace_v1");
    expect(body).not.toMatch(/insert\s+into\s+public\.organization_projects/i);
    expect(body).not.toMatch(/\bclone\b/i);
    expect(body).not.toMatch(/\bstorage\b/i);
    expect(body).not.toMatch(/\bxero\b/i);
    expect(body).not.toContain("sync_opportunity_legacy_quote_on_conversion");
    expect(body).toContain("insert into public.opportunity_final_projects");
    expect(body).toContain("converted_project_id = workspace_row.id");
  });

  it("guards legacy conversion only for explicit promotion strategy", () => {
    const body = functionBody("convert_accepted_opportunity_to_project");
    expect(body).toContain("lifecycle.strategy = 'promote_workspace_v1'");
    expect(body).toContain(
      "Promotion-strategy Opportunities cannot use legacy conversion",
    );
    expect(body).toContain("insert into public.organization_projects");
    expect(body).toContain("sync_opportunity_legacy_quote_on_conversion");
    expect(body).toContain("ensure_opportunity_project_document_workspace");
  });

  it("preserves the authoritative legacy function aside from the new guard", () => {
    const previous = functionBodyFrom(
      previousMigration,
      "convert_accepted_opportunity_to_project",
    );
    const currentWithoutGuard = functionBody(
      "convert_accepted_opportunity_to_project",
    ).replace(
      /if exists \(\s*select 1\s*from public\.opportunity_lifecycles lifecycle[\s\S]*?'TS409';\s*end if;/,
      "",
    );
    const normalize = (value: string) => value.replace(/\s+/g, "");
    expect(normalize(currentWithoutGuard)).toBe(normalize(previous));
  });

  it("does not change active creation, award, visibility, UI, or Xero files", () => {
    const activeCreationFiles = [
      "app/app/(workspace)/leads-clients/opportunities/NewOpportunityDialog.tsx",
      "app/app/(workspace)/leads-clients/opportunities/new/page.tsx",
    ];
    for (const file of activeCreationFiles) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toContain("create_opportunity_workspace_v1");
    }

    const awardRoute = readFileSync(
      "app/api/leads-clients/opportunities/[opportunitySlug]/convert/route.ts",
      "utf8",
    );
    expect(awardRoute).not.toContain("promote_opportunity_workspace_v1");
    expect(awardRoute).toContain("convertOpportunityToProject");

    const projectLoader = readFileSync("lib/projects-server.ts", "utf8");
    expect(projectLoader).not.toContain("opportunity_lifecycles");
    expect(projectLoader).not.toContain("opportunity_promotion_events");
    expect(projectLoader).toContain('.select("workspace_project_id")');
    expect(projectLoader).toContain(
      '.not("workspace_project_id", "is", null)',
    );
  });
});
