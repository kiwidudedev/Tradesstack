import "server-only";

/* eslint-disable @typescript-eslint/no-explicit-any -- Definition adapters normalize dynamic table and RPC result shapes. */

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { QADefinition, QADefinitionStatus, QAFieldDefinition, QAFieldOption, QAFieldType, QASectionDefinition } from "./types";

type Row = Record<string, unknown>;

function text(row: Row, key: string) { return typeof row[key] === "string" ? row[key] as string : ""; }
function nullableText(row: Row, key: string) { return typeof row[key] === "string" ? row[key] as string : null; }
function integer(row: Row, key: string, fallback = 0) { return typeof row[key] === "number" ? row[key] as number : fallback; }
function flag(row: Row, key: string, fallback = false) { return typeof row[key] === "boolean" ? row[key] as boolean : fallback; }

function mapOption(row: Row): QAFieldOption {
  return { id: text(row, "id"), label: text(row, "label"), value: text(row, "value"), sortOrder: integer(row, "sort_order") };
}

function mapField(row: Row, options: QAFieldOption[]): QAFieldDefinition {
  return {
    id: text(row, "id"), fieldType: text(row, "field_type") as QAFieldType, label: text(row, "label"),
    description: text(row, "description"), instructions: text(row, "instructions"), required: flag(row, "required"),
    allowNa: flag(row, "allow_na"), requirement: text(row, "requirement"), acceptanceCriteria: text(row, "acceptance_criteria"),
    referenceText: text(row, "reference_text"), photoRequired: flag(row, "photo_required"), minimumPhotos: integer(row, "minimum_photos"),
    fileRequired: flag(row, "file_required"), requireCommentOnFail: flag(row, "require_comment_on_fail"),
    requirePhotoOnFail: flag(row, "require_photo_on_fail"), createIssueOnFail: flag(row, "create_issue_on_fail"),
    requireRectificationOnFail: flag(row, "require_rectification_on_fail"), blockCompletionOnFail: flag(row, "block_completion_on_fail"),
    requireSupervisorReviewOnFail: flag(row, "require_supervisor_review_on_fail"), aiReviewEnabled: flag(row, "ai_review_enabled"),
    aiReviewInstruction: text(row, "ai_review_instruction"), includeInReport: flag(row, "include_in_report", true),
    configuration: row.configuration && typeof row.configuration === "object" && !Array.isArray(row.configuration) ? row.configuration as Record<string, unknown> : {},
    configurationSchemaVersion: integer(row, "configuration_schema_version", 1), sortOrder: integer(row, "sort_order"), options,
  };
}

async function loadDefinitionRows(params: { scope: "template"; organizationId: string; id: string } | { scope: "project"; organizationId: string; projectId: string; id: string }) {
  const supabase = await createServerSupabaseClient();
  const client = supabase as any;
  if (params.scope === "template") {
    const [parent, sections, fields, options] = await Promise.all([
      client.from("qa_templates").select("*").eq("organization_id", params.organizationId).eq("id", params.id).maybeSingle(),
      client.from("qa_template_sections").select("*").eq("organization_id", params.organizationId).eq("template_id", params.id).order("sort_order"),
      client.from("qa_template_fields").select("*").eq("organization_id", params.organizationId).eq("template_id", params.id).order("sort_order"),
      client.from("qa_template_field_options").select("*").eq("organization_id", params.organizationId).eq("template_id", params.id).order("sort_order"),
    ]);
    if (parent.error || !parent.data || sections.error || fields.error || options.error) return null;
    return { parent: parent.data as Row, sections: sections.data as Row[], fields: fields.data as Row[], options: options.data as Row[] };
  }
  const base = (query: any) => query.eq("organization_id", params.organizationId).eq("project_id", params.projectId).eq("project_qa_id", params.id);
  const [parent, sections, fields, options] = await Promise.all([
    client.from("project_qas").select("*").eq("organization_id", params.organizationId).eq("project_id", params.projectId).eq("id", params.id).maybeSingle(),
    base(client.from("project_qa_sections").select("*")).order("sort_order"),
    base(client.from("project_qa_fields").select("*")).order("sort_order"),
    base(client.from("project_qa_field_options").select("*")).order("sort_order"),
  ]);
  if (parent.error || !parent.data || sections.error || fields.error || options.error) return null;
  return { parent: parent.data as Row, sections: sections.data as Row[], fields: fields.data as Row[], options: options.data as Row[] };
}

function hydrateDefinition(rows: { parent: Row; sections: Row[]; fields: Row[]; options: Row[] }): QADefinition {
  const optionsByField = new Map<string, QAFieldOption[]>();
  for (const row of rows.options) {
    const key = text(row, "field_id");
    optionsByField.set(key, [...(optionsByField.get(key) ?? []), mapOption(row)]);
  }
  const fieldsBySection = new Map<string, QAFieldDefinition[]>();
  for (const row of rows.fields) {
    const key = text(row, "section_id");
    fieldsBySection.set(key, [...(fieldsBySection.get(key) ?? []), mapField(row, optionsByField.get(text(row, "id")) ?? [])]);
  }
  const sections: QASectionDefinition[] = rows.sections.map((row) => ({
    id: text(row, "id"), title: text(row, "title"), description: text(row, "description"), sortOrder: integer(row, "sort_order"),
    fields: fieldsBySection.get(text(row, "id")) ?? [],
  }));
  return {
    id: text(rows.parent, "id"), name: text(rows.parent, "name"), description: text(rows.parent, "description"),
    status: text(rows.parent, "status") as QADefinitionStatus, definitionVersion: integer(rows.parent, "definition_version", 1), sections,
    sourceTemplateName: nullableText(rows.parent, "source_template_name"), copiedAt: nullableText(rows.parent, "copied_at"),
  };
}

export async function getQATemplateDefinition(organizationId: string, templateId: string) {
  const rows = await loadDefinitionRows({ scope: "template", organizationId, id: templateId });
  return rows ? hydrateDefinition(rows) : null;
}

export async function getProjectQADefinition(organizationId: string, projectId: string, projectQaId: string) {
  const rows = await loadDefinitionRows({ scope: "project", organizationId, projectId, id: projectQaId });
  return rows ? hydrateDefinition(rows) : null;
}

export type QARegisterRow = {
  id: string; name: string; description: string; status: QADefinitionStatus; updatedAt: string;
  updatedBy: string; sectionCount: number; fieldCount: number; sourceTemplateName?: string | null;
  inProgressCount: number; completedCount: number; cancelledCount: number;
};

async function countDefinitions(client: any, config: { parentTable: string; sectionTable: string; fieldTable: string; parentKey: string; organizationId: string; projectId?: string }) {
  const parentColumns = config.projectId
    ? "id,name,description,status,updated_at,updated_by,source_template_name"
    : "id,name,description,status,updated_at,updated_by";
  let parentsQuery = client.from(config.parentTable).select(parentColumns).eq("organization_id", config.organizationId).order("updated_at", { ascending: false });
  let sectionsQuery = client.from(config.sectionTable).select(`${config.parentKey},id`).eq("organization_id", config.organizationId);
  let fieldsQuery = client.from(config.fieldTable).select(`${config.parentKey},id`).eq("organization_id", config.organizationId);
  const membersQuery = client.from("organization_members").select("user_id,display_name").eq("organization_id", config.organizationId);
  if (config.projectId) {
    parentsQuery = parentsQuery.eq("project_id", config.projectId);
    sectionsQuery = sectionsQuery.eq("project_id", config.projectId);
    fieldsQuery = fieldsQuery.eq("project_id", config.projectId);
  }
  const [parents, sections, fields, members] = await Promise.all([parentsQuery, sectionsQuery, fieldsQuery, membersQuery]);
  if (parents.error) throw new Error(parents.error.message);
  const memberNames = new Map<string, string>(((members.data ?? []) as Row[]).map((row) => [text(row, "user_id"), text(row, "display_name")]));
  const sectionCounts = new Map<string, number>(); const fieldCounts = new Map<string, number>();
  for (const row of (sections.data ?? []) as Row[]) sectionCounts.set(text(row, config.parentKey), (sectionCounts.get(text(row, config.parentKey)) ?? 0) + 1);
  for (const row of (fields.data ?? []) as Row[]) fieldCounts.set(text(row, config.parentKey), (fieldCounts.get(text(row, config.parentKey)) ?? 0) + 1);
  return ((parents.data ?? []) as Row[]).map((row): QARegisterRow => ({
    id: text(row,"id"), name: text(row,"name"), description: text(row,"description"), status: text(row,"status") as QADefinitionStatus,
    updatedAt: text(row,"updated_at"), updatedBy: memberNames.get(text(row,"updated_by")) ?? "Unknown user", sectionCount: sectionCounts.get(text(row,"id")) ?? 0,
    fieldCount: fieldCounts.get(text(row,"id")) ?? 0, sourceTemplateName: nullableText(row,"source_template_name"),
    inProgressCount: 0, completedCount: 0, cancelledCount: 0,
  }));
}

export async function listQATemplates(organizationId: string, options?: { activeOnly?: boolean }) {
  const supabase = await createServerSupabaseClient();
  const rows = await countDefinitions(supabase as any, { parentTable:"qa_templates",sectionTable:"qa_template_sections",fieldTable:"qa_template_fields",parentKey:"template_id",organizationId });
  return options?.activeOnly ? rows.filter((row) => row.status === "active") : rows;
}

export async function listProjectQAs(organizationId: string, projectId: string) {
  const supabase = await createServerSupabaseClient();
  const [rows, summaries] = await Promise.all([
    countDefinitions(supabase as any, { parentTable:"project_qas",sectionTable:"project_qa_sections",fieldTable:"project_qa_fields",parentKey:"project_qa_id",organizationId,projectId }),
    (supabase as any).rpc("list_project_qa_run_summaries_v1", { p_organization_id: organizationId, p_project_id: projectId }),
  ]);
  const counts = new Map<string, { inProgressCount: number; completedCount: number; cancelledCount: number }>();
  if (!summaries.error) for (const row of (summaries.data ?? []) as Row[]) counts.set(text(row,"project_qa_id"), { inProgressCount: integer(row,"in_progress_count"), completedCount: integer(row,"completed_count"), cancelledCount: integer(row,"cancelled_count") });
  return rows.map((row) => ({ ...row, ...(counts.get(row.id) ?? { inProgressCount: 0, completedCount: 0, cancelledCount: 0 }) }));
}

export async function canAccessProjectQA(organizationId: string, projectId: string, permission: "qa.view" | "qa.write" | "qa.inspect" | "qa.verify" | "qa.signoff") {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await (supabase as any).rpc("can_access_qa_project", {
    p_organization_id: organizationId,
    p_project_id: projectId,
    p_permission_key: permission,
  });
  return !error && data === true;
}
