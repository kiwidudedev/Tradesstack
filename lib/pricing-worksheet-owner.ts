export type PricingWorksheetOwnerType = "opportunity" | "variation";

export interface PricingWorksheetOwnerContextValue {
  ownerType: PricingWorksheetOwnerType;
  organizationId: string;
  opportunityId: string | null;
  opportunitySlug: string | null;
  projectId: string | null;
  projectSlug: string | null;
  quoteId: string | null;
  variationId: string | null;
  variationCode: string | null;
}

export function buildOpportunityPricingWorksheetOwner(input: {
  organizationId: string;
  opportunityId: string;
  opportunitySlug: string;
  projectId: string | null;
  projectSlug: string | null;
}): PricingWorksheetOwnerContextValue {
  return {
    ownerType: "opportunity",
    organizationId: input.organizationId,
    opportunityId: input.opportunityId,
    opportunitySlug: input.opportunitySlug,
    projectId: input.projectId,
    projectSlug: input.projectSlug,
    quoteId: null,
    variationId: null,
    variationCode: null,
  };
}

export function buildVariationPricingWorksheetOwner(input: {
  organizationId: string;
  opportunityId: string | null;
  projectId: string;
  projectSlug: string;
  variationId: string;
  variationCode: string | null;
}): PricingWorksheetOwnerContextValue {
  return {
    ownerType: "variation",
    organizationId: input.organizationId,
    opportunityId: input.opportunityId,
    opportunitySlug: null,
    projectId: input.projectId,
    projectSlug: input.projectSlug,
    quoteId: null,
    variationId: input.variationId,
    variationCode: input.variationCode,
  };
}
