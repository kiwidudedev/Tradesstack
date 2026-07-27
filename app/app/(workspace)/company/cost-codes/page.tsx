import { hasOrganizationPermission } from "@/lib/permissions-server";
import {
  listOrganizationAccountingResolutionPreview,
  listOrganizationCostCodes,
  listOrganizationTradesstackAccountingMappings,
} from "@/lib/accounting/queries";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { getOrganizationXeroConnection } from "@/lib/xero/service";
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

  const [costCodes, mappings, xeroConnection] = await Promise.all([
    listOrganizationCostCodes(currentMember.organization_id),
    listOrganizationTradesstackAccountingMappings(currentMember.organization_id),
    getOrganizationXeroConnection(currentMember.organization_id),
  ]);

  const providers = Array.from(
    new Set(
      [
        ...costCodes.map((row) => row.external_provider).filter((value): value is string => Boolean(value)),
        ...mappings.map((row) => row.provider).filter((value): value is string => Boolean(value)),
      ].map((value) => value.trim().toLowerCase())
    )
  );

  const previewProvider = providers[0] ?? "manual";
  const previewData = await listOrganizationAccountingResolutionPreview(
    currentMember.organization_id,
    previewProvider
  );

  return (
    <CompanyCostCodesWorkspace
      organizationId={currentMember.organization_id}
      canEdit={canEdit}
      costCodes={costCodes}
      mappings={mappings}
      previewProvider={previewProvider}
      previewRows={previewData.previewRows}
      unresolvedRows={previewData.unresolvedRows}
      currentXeroTenantId={xeroConnection?.tenant_id ?? null}
      currentXeroTenantName={xeroConnection?.tenant_name ?? null}
    />
  );
}
