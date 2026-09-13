import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  calls: [] as Array<{ table: string; filters: Record<string, unknown> }>,
  project: {
    id: "project-a",
    organization_id: "organization-a",
    project_code: "PA",
    slug: "project-a",
    name: "Project A",
    location: "1 Project Street",
    client_id: null,
    source_opportunity_id: "opportunity-a",
  },
}));

vi.mock("@/lib/trade-pack-workspaces-server", () => ({
  getTradePackWorkspaceBySlugForCurrentUser: vi.fn(async () => mocks.project),
}));

vi.mock("@/lib/projects-server", () => ({
  getCurrentOrganizationMember: vi.fn(async () => ({
    organization_id: "organization-a",
    role: "qs",
  })),
}));

vi.mock("@/lib/permissions-server", () => ({
  getOrganizationPermissionsBatch: vi.fn(async () => ({
    "materials.view": true,
    "quotes.write": true,
  })),
}));

function createQuery(table: string) {
  const filters: Record<string, unknown> = {};
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn((column: string, value: unknown) => {
      filters[column] = value;
      return query;
    }),
    maybeSingle: vi.fn(async () => {
      mocks.calls.push({ table, filters: { ...filters } });
      if (table !== "project_quotes" || filters.id !== "quote-a") return { data: null, error: null };
      return {
        data: {
          id: "quote-a",
          updated_at: "2026-08-21T00:00:00.000Z",
          status: "Draft",
          quote_title: "Persisted quote",
          quote_number: "Q-PA-1",
          client_name: "Persisted Client",
          company_name: "Persisted Company",
          contact_person: "Persisted Contact",
          client_email: "client@example.com",
          client_phone: "123",
          site_address: "Persisted Site",
          project_name: "Persisted Project",
          quote_date: "2026-08-21",
          expiry_date: "2026-09-21",
          optional_items_notes: "",
          scope_exclusions: "Exclusion",
          assumptions: "Assumption",
          scope_notes: "Clarification",
          source_opportunity_id: "opportunity-a",
          margin_percent: 10,
          discount_amount: 5,
          contingency_amount: 20,
          gst_percent: 15,
          validity_period: "30 days",
          payment_terms: "Seven days",
          lead_time: "Two weeks",
          terms_inclusions: "Inclusion",
          terms_exclusions: "Exclusion",
          clarifications: "Clarification",
          acceptance_notes: "Accept",
          award_locked_at: null,
          revision_kind: "project_working",
          revision_number: 1,
          predecessor_quote_id: null,
          pricing_basis_status: "current",
        },
        error: null,
      };
    }),
    order: vi.fn(async () => {
      mocks.calls.push({ table, filters: { ...filters } });
      return {
        data: [{
          id: "line-a",
          section: "Labour",
          description: "Install framing",
          quantity: 2,
          unit: "hr",
          rate: 75,
          is_optional: false,
          sort_order: 3,
          source_opportunity_quote_id: null,
          source_opportunity_quote_line_item_id: null,
          source_opportunity_quote_number: null,
        }],
        error: null,
      };
    }),
  };
  return query;
}

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    from: (table: string) => createQuery(table),
  })),
}));

import { loadProjectQuoteDetail } from "@/lib/project-quote-detail-server";

describe("Project Quote Detail server loader", () => {
  beforeEach(() => {
    mocks.calls.length = 0;
  });

  it("returns persisted quote snapshots and ordered line values", async () => {
    const result = await loadProjectQuoteDetail("project-a", "quote-a");

    expect(result).toMatchObject({
      kind: "existing",
      organizationId: "organization-a",
      projectId: "project-a",
      canManageQuote: true,
      quote: {
        id: "quote-a",
        clientName: "Persisted Client",
        status: "Draft",
        marginPercent: 10,
        gstPercent: 15,
      },
      lines: [{
        id: "line-a",
        quantity: 2,
        rate: 75,
        sortOrder: 3,
      }],
    });
    expect(mocks.calls.map((call) => call.table)).toEqual(["project_quotes", "project_quote_line_items"]);
  });

  it("rejects a cross-project or unknown Quote ID before requesting lines", async () => {
    const result = await loadProjectQuoteDetail("project-a", "quote-from-project-b");

    expect(result).toBeNull();
    expect(mocks.calls).toHaveLength(1);
    expect(mocks.calls[0]).toMatchObject({
      table: "project_quotes",
      filters: {
        organization_id: "organization-a",
        project_id: "project-a",
        id: "quote-from-project-b",
      },
    });
  });
});
