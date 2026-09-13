import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  TakeoffAuthorityConflictError,
  resolveTakeoffProjectAuthorityWithClient,
} from "@/lib/takeoff-owner-server";

type Result = { data: unknown; error: { message: string } | null; count?: number | null };

function query(result: Result) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "is", "limit", "order"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.maybeSingle = vi.fn(async () => result);
  builder.then = (resolve: (value: Result) => void) => resolve(result);
  return builder;
}

function clientFor(results: Record<string, Result[]>) {
  return {
    from: vi.fn((table: string) => {
      const next = results[table]?.shift();
      if (!next) throw new Error(`Unexpected query for ${table}`);
      return query(next);
    }),
  };
}

const empty = { data: null, error: null, count: 0 } satisfies Result;

describe("Takeoff Project graph authority", () => {
  it("uses a direct Project without fabricating Opportunity lineage", async () => {
    const supabase = clientFor({ organization_projects: [{ data: { id: "p1", source_opportunity_id: null }, error: null }] });
    await expect(resolveTakeoffProjectAuthorityWithClient({ supabase: supabase as never, organizationId: "org", projectId: "p1" }))
      .resolves.toEqual({ dataProjectId: "p1", lineageOpportunityId: null, conversionMode: "project" });
  });

  it("keeps promoted workspaces on the same physical Project", async () => {
    const supabase = clientFor({
      organization_projects: [{ data: { id: "p1", source_opportunity_id: "o1" }, error: null }],
      organization_opportunities: [{ data: { id: "o1", workspace_project_id: "p1", converted_project_id: "p1" }, error: null }],
    });
    await expect(resolveTakeoffProjectAuthorityWithClient({ supabase: supabase as never, organizationId: "org", projectId: "p1" }))
      .resolves.toEqual({ dataProjectId: "p1", lineageOpportunityId: "o1", conversionMode: "promoted" });
  });

  it("references the original workspace for a legacy final Project even when drawing metadata was cloned", async () => {
    const supabase = clientFor({
      organization_projects: [
        { data: { id: "p2", source_opportunity_id: "o1" }, error: null },
        { data: { id: "p1" }, error: null },
      ],
      organization_opportunities: [{ data: { id: "o1", workspace_project_id: "p1", converted_project_id: "p2" }, error: null }],
      takeoff_pages: [{ ...empty, count: 2 }, empty],
      takeoff_measurements: [{ ...empty, count: 4 }, empty],
      takeoff_render_jobs: [empty, empty],
    });
    await expect(resolveTakeoffProjectAuthorityWithClient({ supabase: supabase as never, organizationId: "org", projectId: "p2" }))
      .resolves.toEqual({ dataProjectId: "p1", lineageOpportunityId: "o1", conversionMode: "legacy-reference" });
    expect(supabase.from).not.toHaveBeenCalledWith("project_drawing_sets");
  });

  it("fails closed when the final Project contains a connected Takeoff graph", async () => {
    const supabase = clientFor({
      organization_projects: [
        { data: { id: "p2", source_opportunity_id: "o1" }, error: null },
        { data: { id: "p1" }, error: null },
      ],
      organization_opportunities: [{ data: { id: "o1", workspace_project_id: "p1", converted_project_id: "p2" }, error: null }],
      takeoff_pages: [{ ...empty, count: 1 }, { ...empty, count: 1 }],
      takeoff_measurements: [empty, empty],
      takeoff_render_jobs: [empty, empty],
    });
    await expect(resolveTakeoffProjectAuthorityWithClient({ supabase: supabase as never, organizationId: "org", projectId: "p2" }))
      .rejects.toBeInstanceOf(TakeoffAuthorityConflictError);
  });
});

