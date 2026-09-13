import { notFound, redirect } from "next/navigation";
import { ProjectQADetail } from "@/components/app/quality-assurance/project/ProjectQADetail";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { getTradePackWorkspaceBySlugForCurrentUser } from "@/lib/trade-pack-workspaces-server";
import { getOrganizationPermissionsBatch } from "@/lib/permissions-server";
import { canAccessProjectQA, getProjectQADefinition } from "@/lib/quality-assurance/definitions/server";
import { getProjectQAMetadata, listProjectQARuns } from "@/lib/quality-assurance/execution/server";

export default async function ProjectQADetailPage({ params }: { params: Promise<{ projectId: string; projectQaId: string }> }) {
  const [{ projectId, projectQaId }, member] = await Promise.all([params, getCurrentOrganizationMember()]);
  if (!member) redirect("/sign-in");
  const project = await getTradePackWorkspaceBySlugForCurrentUser(projectId);
  if (!project || project.organization_id !== member.organization_id) notFound();
  const permissions = await getOrganizationPermissionsBatch({ organizationId: member.organization_id, permissions: ["qa.view", "qa.write", "qa.inspect"] });
  if (!permissions["qa.view"] || !(await canAccessProjectQA(member.organization_id, project.id, "qa.view"))) notFound();
  const [definition, metadata, runs] = await Promise.all([
    getProjectQADefinition(member.organization_id, project.id, projectQaId),
    getProjectQAMetadata(member.organization_id, project.id, projectQaId),
    listProjectQARuns(member.organization_id, project.id, projectQaId),
  ]);
  if (!definition || !metadata) notFound();
  const [canWrite, canInspect] = await Promise.all([
    permissions["qa.write"] ? canAccessProjectQA(member.organization_id, project.id, "qa.write") : false,
    permissions["qa.inspect"] ? canAccessProjectQA(member.organization_id, project.id, "qa.inspect") : false,
  ]);
  return <ProjectQADetail definition={definition} projectSlug={projectId} updatedAt={metadata.updatedAt} runs={runs} canWrite={canWrite && definition.status !== "archived"} canInspect={canInspect} />;
}
