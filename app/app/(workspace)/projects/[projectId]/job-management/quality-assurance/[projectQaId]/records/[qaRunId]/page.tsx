import { notFound, redirect } from "next/navigation";
import { ProjectQARecord } from "@/components/app/quality-assurance/project/ProjectQARecord";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { getTradePackWorkspaceBySlugForCurrentUser } from "@/lib/trade-pack-workspaces-server";
import { getOrganizationPermissionsBatch } from "@/lib/permissions-server";
import { canAccessProjectQA } from "@/lib/quality-assurance/definitions/server";
import { getProjectQARun, listQARecordPeople } from "@/lib/quality-assurance/execution/server";

export default async function ProjectQARecordPage({ params }: { params: Promise<{ projectId: string; projectQaId: string; qaRunId: string }> }) {
  const [{ projectId, projectQaId, qaRunId }, member] = await Promise.all([params, getCurrentOrganizationMember()]);
  if (!member) redirect("/sign-in");
  const project = await getTradePackWorkspaceBySlugForCurrentUser(projectId);
  if (!project || project.organization_id !== member.organization_id) notFound();
  const permissions = await getOrganizationPermissionsBatch({ organizationId: member.organization_id, permissions: ["qa.view", "qa.inspect", "qa.verify", "qa.signoff"] });
  if (!permissions["qa.view"] || !(await canAccessProjectQA(member.organization_id, project.id, "qa.view"))) notFound();
  const [run, people] = await Promise.all([
    getProjectQARun(member.organization_id, project.id, projectQaId, qaRunId),
    listQARecordPeople(member.organization_id),
  ]);
  if (!run) notFound();
  const [canInspect, canVerify, canSignoff] = await Promise.all([
    permissions["qa.inspect"] ? canAccessProjectQA(member.organization_id, project.id, "qa.inspect") : false,
    permissions["qa.verify"] ? canAccessProjectQA(member.organization_id, project.id, "qa.verify") : false,
    permissions["qa.signoff"] ? canAccessProjectQA(member.organization_id, project.id, "qa.signoff") : false,
  ]);
  return <ProjectQARecord initialRun={run} projectSlug={projectId} people={people} currentUserName={member.display_name || "TradesStack user"} canInspect={canInspect} canVerify={canVerify} canSignoff={canSignoff} />;
}
