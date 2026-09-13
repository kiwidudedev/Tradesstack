import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  project: {
    id: "project-a",
    organization_id: "organization-a",
    source_opportunity_id: "opportunity-a",
    slug: "project-a",
  } as {
    id: string;
    organization_id: string;
    source_opportunity_id: string | null;
    slug: string;
  } | null,
  quotes: new Map([
    ["quote-a", { id: "quote-a", organizationId: "organization-a", projectId: "project-a" }],
    ["quote-b", { id: "quote-b", organizationId: "organization-a", projectId: "project-b" }],
  ]),
  worksheets: new Map([
    ["worksheet-a", {
      id: "worksheet-a",
      archived: false,
      cloneKind: null as string | null,
      opportunityId: "opportunity-a",
      organizationId: "organization-a",
      projectId: "project-a",
      quoteId: null as string | null,
      variationId: null as string | null,
    }],
  ]),
  queries: [] as Array<{ filters: Record<string, unknown>; table: string }>,
}));

function createQuery(table: string) {
  const filters: Record<string, unknown> = {};
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn((column: string, value: unknown) => {
      filters[column] = value;
      return query;
    }),
    is: vi.fn((column: string, value: unknown) => {
      filters[column] = value;
      return query;
    }),
    or: vi.fn((value: string) => {
      filters.or = value;
      return query;
    }),
    maybeSingle: vi.fn(async () => {
      mocks.queries.push({ filters: { ...filters }, table });
      if (table === "project_quotes") {
        const quote = mocks.quotes.get(String(filters.id));
        const matches = quote
          && quote.organizationId === filters.organization_id
          && quote.projectId === filters.project_id;
        return { data: matches ? { id: quote.id } : null, error: null };
      }

      const worksheet = mocks.worksheets.get(String(filters.id));
      const matches = worksheet
        && !worksheet.archived
        && worksheet.organizationId === filters.organization_id
        && worksheet.opportunityId === filters.opportunity_id
        && worksheet.projectId === filters.project_id
        && worksheet.variationId === filters.variation_id
        && (worksheet.quoteId === null || worksheet.cloneKind === "project_working");
      return { data: matches ? { id: worksheet.id } : null, error: null };
    }),
  };
  return query;
}

vi.mock("@/lib/trade-pack-workspaces-server", () => ({
  getTradePackWorkspaceBySlugForCurrentUser: vi.fn(async () => mocks.project),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    from: (table: string) => createQuery(table),
  })),
}));

import { loadProjectPricingWorksheetRouteContext } from "@/lib/project-pricing-worksheet-route-server";

describe("Project Pricing Worksheet route context", () => {
  beforeEach(() => {
    mocks.queries.length = 0;
    mocks.project = {
      id: "project-a",
      organization_id: "organization-a",
      source_opportunity_id: "opportunity-a",
      slug: "project-a",
    };
  });

  it("validates the quote and preserves Project working-workbook ownership", async () => {
    const context = await loadProjectPricingWorksheetRouteContext("project-a", "quote-a");

    expect(context).toMatchObject({
      quoteId: "quote-a",
      registerPath: "/app/projects/project-a/preconstruction/quote/quote-a/pricing-worksheet",
      owner: {
        ownerType: "project",
        organizationId: "organization-a",
        opportunityId: "opportunity-a",
        projectId: "project-a",
        quoteId: null,
        readOnly: false,
      },
    });
    expect(mocks.queries).toEqual([{
      table: "project_quotes",
      filters: {
        id: "quote-a",
        organization_id: "organization-a",
        project_id: "project-a",
      },
    }]);
  });

  it("rejects a quote that belongs to another Project", async () => {
    await expect(
      loadProjectPricingWorksheetRouteContext("project-a", "quote-b"),
    ).resolves.toBeNull();
  });

  it("validates direct deep links against the Project workbook scope", async () => {
    const context = await loadProjectPricingWorksheetRouteContext(
      "project-a",
      "quote-a",
      "worksheet-a",
    );

    expect(context?.owner.projectId).toBe("project-a");
    expect(mocks.queries).toHaveLength(2);
    expect(mocks.queries[1]).toEqual({
      table: "opportunity_pricing_worksheets",
      filters: {
        archived_at: null,
        id: "worksheet-a",
        opportunity_id: "opportunity-a",
        organization_id: "organization-a",
        or: "quote_id.is.null,clone_kind.eq.project_working",
        project_id: "project-a",
        variation_id: null,
      },
    });
  });

  it("rejects an archived or cross-Project workbook deep link", async () => {
    const worksheet = mocks.worksheets.get("worksheet-a");
    if (!worksheet) throw new Error("Missing test worksheet.");
    worksheet.archived = true;

    await expect(
      loadProjectPricingWorksheetRouteContext("project-a", "quote-a", "worksheet-a"),
    ).resolves.toBeNull();

    worksheet.archived = false;
  });
});
