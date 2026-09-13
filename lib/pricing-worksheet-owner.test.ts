import { describe, expect, it } from "vitest";
import {
  buildOpportunityPricingWorksheetOwner,
  buildProjectPricingWorksheetOwner,
  buildQuotePricingWorksheetOwner,
} from "@/lib/pricing-worksheet-owner";

describe("pricing worksheet owners", () => {
  it("constructs a tenant/project/quote-scoped working owner", () => {
    expect(buildQuotePricingWorksheetOwner({
      organizationId: "org-1",
      opportunityId: "opp-1",
      projectId: "project-1",
      projectSlug: "project-one",
      quoteId: "quote-1",
    })).toEqual({
      ownerType: "quote",
      organizationId: "org-1",
      opportunityId: "opp-1",
      opportunitySlug: null,
      projectId: "project-1",
      projectSlug: "project-one",
      quoteId: "quote-1",
      variationId: null,
      variationCode: null,
      readOnly: false,
    });
  });

  it("constructs an immutable tender-history owner", () => {
    expect(buildOpportunityPricingWorksheetOwner({
      organizationId: "org-1",
      opportunityId: "opp-1",
      opportunitySlug: "opp-one",
      projectId: null,
      projectSlug: null,
      readOnly: true,
    }).readOnly).toBe(true);
  });

  it("constructs a generic Project owner without Quote or Variation ownership", () => {
    expect(buildProjectPricingWorksheetOwner({
      organizationId: "org-1",
      opportunityId: "opp-1",
      projectId: "project-1",
      projectSlug: "project-one",
    })).toMatchObject({
      ownerType: "project",
      opportunityId: "opp-1",
      projectId: "project-1",
      quoteId: null,
      variationId: null,
      readOnly: false,
    });
  });
});
