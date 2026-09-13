"use server";

/* eslint-disable @typescript-eslint/no-explicit-any -- New RPCs are intentionally accessed through the ungenerated migration boundary. */

import { revalidatePath } from "next/cache";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { getTradePackWorkspaceBySlugForCurrentUser } from "@/lib/trade-pack-workspaces-server";
import { hasOrganizationPermission } from "@/lib/permissions-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { normalizeDefinition, validateQADefinition } from "./model";
import { canAccessProjectQA } from "./server";
import type { QADefinition } from "./types";

export type QAActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

async function requireTemplatePermission(permission: "qa.templates.view" | "qa.templates.write") {
  const member = await getCurrentOrganizationMember();
  if (!member || !(await hasOrganizationPermission(member.organization_id, permission))) throw new Error("You do not have permission to manage QA templates.");
  return member;
}

async function requireProjectPermission(projectSlug: string, permission: "qa.view" | "qa.write" | "qa.inspect") {
  const [member, project] = await Promise.all([getCurrentOrganizationMember(), getTradePackWorkspaceBySlugForCurrentUser(projectSlug)]);
  if (!member || !project || project.organization_id !== member.organization_id || !(await hasOrganizationPermission(member.organization_id, permission))) throw new Error("You do not have permission to manage QA for this project.");
  if (!(await canAccessProjectQA(member.organization_id, project.id, permission))) throw new Error("You do not have access to QA for this project.");
  return { member, project };
}

function message(error: unknown) { return error instanceof Error ? error.message : "The QA operation failed."; }

export async function createQATemplateAction(input: { name: string; description?: string }): Promise<QAActionResult<{ id: string }>> {
  try {
    const member = await requireTemplatePermission("qa.templates.write");
    const supabase = await createServerSupabaseClient();
    const { data, error } = await (supabase as any).rpc("create_qa_template_v1", { p_organization_id: member.organization_id, p_name: input.name, p_description: input.description ?? "" });
    if (error || !data) throw new Error(error?.message ?? "Unable to create QA template.");
    revalidatePath("/app/settings/qa-templates");
    return { ok: true, data: { id: String(data) } };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function saveQATemplateAction(definition: QADefinition): Promise<QAActionResult<{ version: number }>> {
  try {
    const member = await requireTemplatePermission("qa.templates.write");
    const normalized = normalizeDefinition(definition); const errors = validateQADefinition(normalized);
    if (errors.length) throw new Error(errors[0]);
    const supabase = await createServerSupabaseClient();
    const { data, error } = await (supabase as any).rpc("save_qa_template_definition_v1", { p_organization_id: member.organization_id, p_template_id: definition.id, p_name: normalized.name, p_description: normalized.description, p_status: normalized.status, p_sections: normalized.sections, p_expected_version: definition.definitionVersion });
    if (error || !data) throw new Error(error?.message ?? "Unable to save QA template.");
    revalidatePath("/app/settings/qa-templates"); revalidatePath(`/app/settings/qa-templates/${definition.id}`);
    return { ok: true, data: { version: Number(data) } };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function setQATemplateLifecycleAction(templateId: string, action: "archive" | "delete"): Promise<QAActionResult> {
  try {
    const member = await requireTemplatePermission("qa.templates.write"); const supabase = await createServerSupabaseClient();
    const { error } = await (supabase as any).rpc("set_qa_template_lifecycle_v1", { p_organization_id: member.organization_id, p_template_id: templateId, p_action: action });
    if (error) throw new Error(error.message); revalidatePath("/app/settings/qa-templates"); return { ok: true, data: undefined };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function duplicateQATemplateAction(templateId: string): Promise<QAActionResult<{ id: string }>> {
  try {
    const member = await requireTemplatePermission("qa.templates.write"); const supabase = await createServerSupabaseClient();
    const { data, error } = await (supabase as any).rpc("duplicate_qa_template_v1", { p_organization_id: member.organization_id, p_template_id: templateId });
    if (error || !data) throw new Error(error?.message ?? "Unable to duplicate QA template.");
    revalidatePath("/app/settings/qa-templates"); return { ok:true,data:{id:String(data)} };
  } catch (error) { return { ok:false,error:message(error) }; }
}

export async function createBlankProjectQAAction(input: { projectSlug: string; name: string; description?: string }): Promise<QAActionResult<{ id: string }>> {
  try {
    const { member, project } = await requireProjectPermission(input.projectSlug, "qa.write"); const supabase = await createServerSupabaseClient();
    const { data, error } = await (supabase as any).rpc("create_blank_project_qa_v1", { p_organization_id: member.organization_id, p_project_id: project.id, p_name: input.name, p_description: input.description ?? "" });
    if (error || !data) throw new Error(error?.message ?? "Unable to create Project QA.");
    revalidatePath(`/app/projects/${input.projectSlug}/job-management/quality-assurance`); return { ok: true, data: { id: String(data) } };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function createProjectQAFromTemplateAction(input: { projectSlug: string; templateId: string; name?: string }): Promise<QAActionResult<{ id: string }>> {
  try {
    const { member, project } = await requireProjectPermission(input.projectSlug, "qa.write");
    if (!(await hasOrganizationPermission(member.organization_id,"qa.templates.view"))) throw new Error("You cannot view company QA templates.");
    const supabase = await createServerSupabaseClient();
    const { data, error } = await (supabase as any).rpc("create_project_qa_from_template_v1", { p_organization_id: member.organization_id, p_project_id: project.id, p_template_id: input.templateId, p_name: input.name ?? null });
    if (error || !data) throw new Error(error?.message ?? "Unable to copy QA template.");
    revalidatePath(`/app/projects/${input.projectSlug}/job-management/quality-assurance`); return { ok: true, data: { id: String(data) } };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function saveProjectQAAction(input: { projectSlug: string; definition: QADefinition }): Promise<QAActionResult<{ version: number }>> {
  try {
    const { member, project } = await requireProjectPermission(input.projectSlug,"qa.write"); const normalized = normalizeDefinition(input.definition);
    const errors = validateQADefinition(normalized); if (errors.length) throw new Error(errors[0]); const supabase = await createServerSupabaseClient();
    const { data, error } = await (supabase as any).rpc("save_project_qa_definition_v1", { p_organization_id: member.organization_id,p_project_id:project.id,p_project_qa_id:normalized.id,p_name:normalized.name,p_description:normalized.description,p_status:normalized.status,p_sections:normalized.sections,p_expected_version:input.definition.definitionVersion });
    if (error || !data) throw new Error(error?.message ?? "Unable to save Project QA.");
    revalidatePath(`/app/projects/${input.projectSlug}/job-management/quality-assurance`); revalidatePath(`/app/projects/${input.projectSlug}/job-management/quality-assurance/${normalized.id}`);
    return { ok:true,data:{version:Number(data)} };
  } catch (error) { return { ok:false,error:message(error) }; }
}

export async function setProjectQALifecycleAction(input: { projectSlug: string; projectQaId: string; action: "archive" | "delete" }): Promise<QAActionResult> {
  try {
    const { member, project } = await requireProjectPermission(input.projectSlug, "qa.write");
    const supabase = await createServerSupabaseClient();
    const { error } = await (supabase as any).rpc("set_project_qa_lifecycle_v1", {
      p_organization_id: member.organization_id,
      p_project_id: project.id,
      p_project_qa_id: input.projectQaId,
      p_action: input.action,
    });
    if (error) throw new Error(error.message);
    revalidatePath(`/app/projects/${input.projectSlug}/job-management/quality-assurance`);
    return { ok: true, data: undefined };
  } catch (error) { return { ok: false, error: message(error) }; }
}

export async function makeProjectQAReadyAction(input: { projectSlug: string; projectQaId: string }): Promise<QAActionResult<{ version: number }>> {
  try {
    const { member, project } = await requireProjectPermission(input.projectSlug, "qa.write");
    const supabase = await createServerSupabaseClient();
    const { data, error } = await (supabase as any).rpc("make_project_qa_ready_v1", {
      p_organization_id: member.organization_id,
      p_project_id: project.id,
      p_project_qa_id: input.projectQaId,
    });
    if (error) throw new Error(error.message);
    revalidatePath(`/app/projects/${input.projectSlug}/job-management/quality-assurance`);
    revalidatePath(`/app/projects/${input.projectSlug}/job-management/quality-assurance/${input.projectQaId}`);
    revalidatePath(`/app/projects/${input.projectSlug}/job-management/quality-assurance/${input.projectQaId}/edit`);
    return { ok: true, data: { version: Number(data) } };
  } catch (error) { return { ok: false, error: message(error) }; }
}
