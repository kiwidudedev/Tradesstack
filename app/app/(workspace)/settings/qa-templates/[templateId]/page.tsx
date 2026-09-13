import { notFound,redirect } from "next/navigation";
import { QATemplateEditor } from "@/components/app/quality-assurance/templates/QATemplateEditor";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { getOrganizationPermissionsBatch } from "@/lib/permissions-server";
import { getQATemplateDefinition } from "@/lib/quality-assurance/definitions/server";

export default async function QATemplateEditorPage({params,searchParams}:{params:Promise<{templateId:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const [{templateId},query,member]=await Promise.all([params,searchParams,getCurrentOrganizationMember()]); if(!member)redirect("/sign-in");
  const permissions=await getOrganizationPermissionsBatch({organizationId:member.organization_id,permissions:["qa.templates.view","qa.templates.write"]}); if(!permissions["qa.templates.view"])redirect("/app/settings/organization");
  const definition=await getQATemplateDefinition(member.organization_id,templateId);if(!definition)notFound();
  return <QATemplateEditor definition={definition} canWrite={permissions["qa.templates.write"]===true&&definition.status!=="archived"} initialPreview={query.preview==="1"}/>;
}

