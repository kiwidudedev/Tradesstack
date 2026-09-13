"use server";

import { getOrganizationPermissionsBatch } from "@/lib/permissions-server";
import { getCurrentOrganizationMember } from "@/lib/projects-server";

export type VariationSupplierPricingPermissions = {
  canViewMaterials: boolean;
  canWriteVariation: boolean;
};

export async function loadVariationSupplierPricingPermissionsAction(): Promise<VariationSupplierPricingPermissions> {
  const member = await getCurrentOrganizationMember();
  if (!member) return { canViewMaterials: false, canWriteVariation: false };
  const permissions = await getOrganizationPermissionsBatch({
    organizationId: member.organization_id,
    permissions: ["materials.view", "variations.write"],
  });
  return {
    canViewMaterials: permissions["materials.view"] === true,
    canWriteVariation: permissions["variations.write"] === true,
  };
}
