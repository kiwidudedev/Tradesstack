import { redirect } from "next/navigation";
import { QATemplateRegister } from "@/components/app/quality-assurance/templates/QATemplateRegister";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { getOrganizationPermissionsBatch } from "@/lib/permissions-server";
import { listQATemplates } from "@/lib/quality-assurance/definitions/server";

export default async function QATemplatesPage() {
  const member=await getCurrentOrganizationMember(); if(!member) redirect("/sign-in");
  const permissions=await getOrganizationPermissionsBatch({organizationId:member.organization_id,permissions:["qa.templates.view","qa.templates.write"]});
  if(!permissions["qa.templates.view"]) redirect("/app/settings/organization");
  const templates=await listQATemplates(member.organization_id);
  return <QATemplateRegister templates={templates} canWrite={permissions["qa.templates.write"]===true}/>;
}

