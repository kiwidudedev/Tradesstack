import { OpportunityQuoteRevisionEditor } from "@/components/app/OpportunityQuoteRevisionEditor";
import { getOrganizationPermissionsBatch } from "@/lib/permissions-server";
import { getCurrentOrganizationMember } from "@/lib/projects-server";

export default async function OpportunityQuoteRevisionPage({
  params,
}: {
  params: Promise<{ revisionId: string }>;
}) {
  const { revisionId } = await params;
  const member = await getCurrentOrganizationMember();
  const permissions = member ? await getOrganizationPermissionsBatch({
    organizationId: member.organization_id,
    permissions: ["materials.view", "quotes.write"],
  }) : {};
  return <OpportunityQuoteRevisionEditor
    revisionId={revisionId}
    canViewMaterials={permissions["materials.view"] === true}
    canWriteQuote={permissions["quotes.write"] === true}
  />;
}
