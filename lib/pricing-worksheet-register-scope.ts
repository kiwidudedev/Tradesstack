import type { PricingWorksheetOwnerContextValue } from "@/lib/pricing-worksheet-owner";

function scopePart(value: string | null | boolean) {
  return encodeURIComponent(value === null ? "null" : String(value));
}

export function buildPricingWorksheetRegisterScopeKey(
  owner: PricingWorksheetOwnerContextValue,
) {
  return [
    owner.ownerType,
    owner.organizationId,
    owner.opportunityId,
    owner.opportunitySlug,
    owner.projectId,
    owner.projectSlug,
    owner.quoteId,
    owner.variationId,
    owner.variationCode,
    owner.readOnly,
  ].map(scopePart).join(":");
}

export function buildPricingWorksheetRegisterLoadScopeKey(input: {
  owner: PricingWorksheetOwnerContextValue;
  sessionOrganizationId: string | null;
  sessionUserId: string | null;
}) {
  return [
    buildPricingWorksheetRegisterScopeKey(input.owner),
    scopePart(input.sessionOrganizationId),
    scopePart(input.sessionUserId),
  ].join(":");
}
