import { hasOrganizationPermission } from "@/lib/permissions-server";
import {
  listOrganizationAccountingResolutionPreview,
  listOrganizationCostCodeMappingRules,
  listOrganizationCostCodes,
} from "@/lib/accounting/queries";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { CompanyCostCodesWorkspace } from "./CompanyCostCodesWorkspace";

export default async function CompanyCostCodesPage() {
  const currentMember = await getCurrentOrganizationMember();

  if (!currentMember) {
    return null;
  }

  const canEdit = await hasOrganizationPermission(
    currentMember.organization_id,
    "settings.organization.update"
  );

  const [costCodes, mappingRules, previewData] = await Promise.all([
    listOrganizationCostCodes(currentMember.organization_id),
    listOrganizationCostCodeMappingRules(currentMember.organization_id),
    listOrganizationAccountingResolutionPreview(currentMember.organization_id),
  ]);

  return (
    <CompanyCostCodesWorkspace
      organizationId={currentMember.organization_id}
      canEdit={canEdit}
      costCodes={costCodes}
      mappingRules={mappingRules}
      previewRows={previewData.previewRows}
      unresolvedRows={previewData.unresolvedRows}
    />
  );
}
