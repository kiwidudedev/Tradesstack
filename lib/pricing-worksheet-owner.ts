export type PricingWorksheetOwnerType = "opportunity" | "project" | "quote" | "variation";

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
  readOnly: boolean;
}

export function buildOpportunityPricingWorksheetOwner(input: {
  organizationId: string;
  opportunityId: string;
  opportunitySlug: string;
  projectId: string | null;
  projectSlug: string | null;
  readOnly?: boolean;
}): PricingWorksheetOwnerContextValue {
  return {
    ownerType: "opportunity",
    organizationId: input.organizationId,
    opportunityId: input.opportunityId,
    opportunitySlug: input.opportunitySlug,
    // Opportunity workbooks are deliberately unowned by a Project. The
    // workspace Project remains navigational context only and must not leak
    // into persistence ownership.
    projectId: null,
    projectSlug: input.projectSlug,
    quoteId: null,
    variationId: null,
    variationCode: null,
    readOnly: input.readOnly === true,
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
    readOnly: false,
  };
}

export function buildProjectPricingWorksheetOwner(input: {
  organizationId: string;
  opportunityId: string;
  projectId: string;
  projectSlug: string;
  readOnly?: boolean;
}): PricingWorksheetOwnerContextValue {
  return {
    ownerType: "project",
    organizationId: input.organizationId,
    opportunityId: input.opportunityId,
    opportunitySlug: null,
    projectId: input.projectId,
    projectSlug: input.projectSlug,
    quoteId: null,
    variationId: null,
    variationCode: null,
    readOnly: input.readOnly === true,
  };
}

export function buildQuotePricingWorksheetOwner(input: {
  organizationId: string;
  opportunityId: string;
  projectId: string;
  projectSlug: string;
  quoteId: string;
  readOnly?: boolean;
}): PricingWorksheetOwnerContextValue {
  return {
    ownerType: "quote",
    organizationId: input.organizationId,
    opportunityId: input.opportunityId,
    opportunitySlug: null,
    projectId: input.projectId,
    projectSlug: input.projectSlug,
    quoteId: input.quoteId,
    variationId: null,
    variationCode: null,
    readOnly: input.readOnly === true,
  };
}
