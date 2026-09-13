import { notFound, redirect } from "next/navigation";
import { ProjectQAEditor } from "@/components/app/quality-assurance/project/ProjectQAEditor";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { getTradePackWorkspaceBySlugForCurrentUser } from "@/lib/trade-pack-workspaces-server";
import { getOrganizationPermissionsBatch } from "@/lib/permissions-server";
import { canAccessProjectQA, getProjectQADefinition } from "@/lib/quality-assurance/definitions/server";

export default async function ProjectQAEditorPage({ params, searchParams }: { params: Promise<{ projectId: string; projectQaId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ projectId, projectQaId }, query, member] = await Promise.all([params, searchParams, getCurrentOrganizationMember()]);
  if (!member) redirect("/sign-in");
  const project = await getTradePackWorkspaceBySlugForCurrentUser(projectId);
  if (!project || project.organization_id !== member.organization_id) notFound();
  const permissions = await getOrganizationPermissionsBatch({ organizationId: member.organization_id, permissions: ["qa.view", "qa.write", "qa.inspect"] });
  if (!permissions["qa.view"] || !(await canAccessProjectQA(member.organization_id, project.id, "qa.view"))) notFound();
  const definition = await getProjectQADefinition(member.organization_id, project.id, projectQaId);
  if (!definition) notFound();
  const [canWrite, canInspect] = await Promise.all([
    permissions["qa.write"] ? canAccessProjectQA(member.organization_id, project.id, "qa.write") : false,
    permissions["qa.inspect"] ? canAccessProjectQA(member.organization_id, project.id, "qa.inspect") : false,
  ]);
  return <ProjectQAEditor definition={definition} projectSlug={projectId} canWrite={canWrite && definition.status !== "archived"} canInspect={canInspect} initialPreview={query.preview === "1"} />;
}
