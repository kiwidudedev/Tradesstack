import { describe, expect, it } from "vitest";
import { resolveOpportunityWorkspaceEnrichment } from "@/lib/opportunity-workspace-enrichment";

describe("opportunity workspace optional enrichment", () => {
  it("keeps the workspace renderable when an optional request has a transport failure", () => {
    const result = resolveOpportunityWorkspaceEnrichment({
      client: { data: null, error: { message: "TypeError: fetch failed" } },
      owner: { data: { display_name: "Corey" }, error: null },
      latestQuote: { data: null, error: null },
      workspaceProject: { data: null, error: null },
    });

    expect(result.clientName).toBe("Unassigned");
    expect(result.ownerName).toBe("Corey");
    expect(result.warnings).toEqual([{ query: "client", message: "TypeError: fetch failed" }]);
  });

  it("normalizes successful optional metadata", () => {
    const result = resolveOpportunityWorkspaceEnrichment({
      client: { data: { company_name: "  Test Client  " }, error: null },
      owner: { data: { display_name: "Corey" }, error: null },
      latestQuote: {
        data: {
          total_quote_price: 1250,
          status: "Draft",
          quote_date: "2026-08-23",
          updated_at: "2026-08-23T01:00:00.000Z",
        },
        error: null,
      },
      workspaceProject: { data: { slug: "test-project" }, error: null },
    });

    expect(result).toMatchObject({
      clientName: "Test Client",
      ownerName: "Corey",
      workspaceProjectSlug: "test-project",
      latestQuoteSummary: { totalQuotePrice: 1250, status: "Draft" },
      warnings: [],
    });
  });
});
