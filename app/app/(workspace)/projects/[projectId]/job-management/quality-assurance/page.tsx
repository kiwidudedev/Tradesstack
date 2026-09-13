import { notFound,redirect } from "next/navigation";
import { ProjectQARegister } from "@/components/app/quality-assurance/project/ProjectQARegister";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { getTradePackWorkspaceBySlugForCurrentUser } from "@/lib/trade-pack-workspaces-server";
import { getOrganizationPermissionsBatch } from "@/lib/permissions-server";
import { canAccessProjectQA,listProjectQAs,listQATemplates } from "@/lib/quality-assurance/definitions/server";

export default async function ProjectJobManagementQualityAssurancePage({params}:{params:Promise<{projectId:string}>}) {
  const [{projectId},member,project]=await Promise.all([params,getCurrentOrganizationMember(),params.then(({projectId})=>getTradePackWorkspaceBySlugForCurrentUser(projectId))]);
  if(!member)redirect("/sign-in"); if(!project||project.organization_id!==member.organization_id)notFound();
  const permissions=await getOrganizationPermissionsBatch({organizationId:member.organization_id,permissions:["qa.view","qa.write","qa.inspect","qa.templates.view","qa.templates.write"]});
  if(!permissions["qa.view"])notFound();
  if(!await canAccessProjectQA(member.organization_id,project.id,"qa.view"))notFound();
  const [plans,templates]=await Promise.all([listProjectQAs(member.organization_id,project.id),permissions["qa.templates.view"]?listQATemplates(member.organization_id,{activeOnly:true}):Promise.resolve([])]);
  const [canWrite,canInspect]=await Promise.all([
    permissions["qa.write"]===true?canAccessProjectQA(member.organization_id,project.id,"qa.write"):false,
    permissions["qa.inspect"]===true?canAccessProjectQA(member.organization_id,project.id,"qa.inspect"):false,
  ]);
  return <ProjectQARegister projectSlug={projectId} plans={plans} templates={templates} canWrite={canWrite} canInspect={canInspect} canViewTemplates={permissions["qa.templates.view"]===true} canManageTemplates={permissions["qa.templates.write"]===true}/>;
}
