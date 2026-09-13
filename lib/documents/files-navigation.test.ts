import { describe, expect, it } from "vitest";
import { resolveOpportunityFilesNavigation } from "@/lib/documents/files-navigation";

describe("Opportunity Files navigation", () => {
  it("keeps active Opportunities on their authoritative Files route", () => {
    expect(resolveOpportunityFilesNavigation({
      opportunitySlug: "active-opportunity",
      finalProject: null,
    })).toEqual({
      href: "/app/leads-clients/opportunities/active-opportunity/files",
      prefetchKind: "opportunity",
      prefetchSlug: "active-opportunity",
    });
  });

  it("links Won Opportunities directly to canonical Project Files", () => {
    expect(resolveOpportunityFilesNavigation({
      opportunitySlug: "won-opportunity",
      finalProject: { slug: "canonical-project" },
    })).toEqual({
      href: "/app/projects/canonical-project/files",
      prefetchKind: "project",
      prefetchSlug: "canonical-project",
    });
  });
});
