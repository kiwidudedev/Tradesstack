import { hasOrganizationPermission } from "@/lib/permissions-server";
import { loadMaterialLibraryPageData } from "@/lib/materials/queries";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { CompanyMaterialsWorkspace } from "./CompanyMaterialsWorkspace";

export default async function CompanyMaterialsPage() {
  const currentMember = await getCurrentOrganizationMember();

  if (!currentMember) {
    return null;
  }

  const [canView, canWrite, canCreateSupplier] = await Promise.all([
    hasOrganizationPermission(currentMember.organization_id, "materials.view"),
    hasOrganizationPermission(currentMember.organization_id, "materials.write"),
    hasOrganizationPermission(currentMember.organization_id, "suppliers.write"),
  ]);

  if (!canView) {
    return null;
  }

  const data = await loadMaterialLibraryPageData({
    supabase: await createServerSupabaseClient(),
    organizationId: currentMember.organization_id,
  });

  return (
    <CompanyMaterialsWorkspace
      organizationId={currentMember.organization_id}
      canWrite={canWrite}
      canCreateSupplier={canCreateSupplier}
      initialData={data}
    />
  );
}
