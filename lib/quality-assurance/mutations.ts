/* eslint-disable @typescript-eslint/no-explicit-any */

import { normalizePhotoPhase, normalizePhotoType } from "@/lib/quality-assurance/helpers";
import { getQualityPhotoSignedUrl } from "@/lib/quality-assurance/storage";
import type {
  ProjectContext,
  QualityIssue,
  QualityPhoto,
  QualityPhotoInsertPayload,
  SignOffStatus,
  SignOffType,
} from "@/lib/quality-assurance/types";

export async function createQualityIssueActivity(
  supabase: any,
  context: ProjectContext,
  session: { id?: string | null; name?: string | null },
  issueId: string,
  action: string,
  detail = ""
) {
  const activityTable = (supabase as any).from("project_quality_issue_activity");
  await activityTable.insert({
    organization_id: context.organizationId,
    project_id: context.projectId,
    issue_id: issueId,
    actor_user_id: session?.id ?? null,
    actor_name: session?.name ?? "",
    action,
    detail,
  });
}

export async function createQualityInspectionActivity(
  supabase: any,
  context: ProjectContext,
  session: { id?: string | null; name?: string | null },
  inspectionId: string,
  action: string,
  detail = "",
  inspectionItemId: string | null = null
) {
  const activityTable = (supabase as any).from("project_quality_inspection_activity");
  await activityTable.insert({
    organization_id: context.organizationId,
    project_id: context.projectId,
    inspection_id: inspectionId,
    inspection_item_id: inspectionItemId,
    actor_user_id: session?.id ?? null,
    actor_name: session?.name ?? "",
    action,
    detail,
  });
}

export async function createQualitySignoffActivity(
  supabase: any,
  context: ProjectContext,
  session: { id?: string | null; name?: string | null },
  signoffId: string,
  action: string,
  detail = ""
) {
  const activityTable = (supabase as any).from("project_quality_signoff_activity");
  await activityTable.insert({
    organization_id: context.organizationId,
    project_id: context.projectId,
    signoff_id: signoffId,
    actor_user_id: session?.id ?? null,
    actor_name: session?.name ?? "",
    action,
    detail,
  });
}

export async function createIssue(
  supabase: any,
  context: ProjectContext,
  session: { id?: string | null },
  payload: {
    title: string;
    description: string;
    trade: string;
    location: string;
    priority: QualityIssue["priority"];
    status: QualityIssue["status"];
    dueDate: string;
    assigneeUserId: string;
    assigneeName: string;
  }
) {
  const issuesTable = (supabase as any).from("project_quality_issues");
  const { data, error } = await issuesTable
    .insert({
      organization_id: context.organizationId,
      project_id: context.projectId,
      created_by: session.id,
      title: payload.title.trim(),
      description: payload.description.trim(),
      trade: payload.trade.trim(),
      location: payload.location.trim(),
      priority: payload.priority,
      status: payload.status,
      due_date: payload.dueDate || null,
      assignee_name: payload.assigneeUserId ? payload.assigneeName : "",
      assignee_user_id: payload.assigneeUserId || null,
    })
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  return data;
}

export async function updateIssue(supabase: any, context: ProjectContext, issueId: string, dbPatch: Record<string, unknown>) {
  const issuesTable = (supabase as any).from("project_quality_issues");
  const { error } = await issuesTable
    .update(dbPatch)
    .eq("id", issueId)
    .eq("organization_id", context.organizationId)
    .eq("project_id", context.projectId);
  if (error) {
    throw new Error(error.message);
  }
}

export async function deleteIssue(supabase: any, context: ProjectContext, issueId: string) {
  const issuesTable = (supabase as any).from("project_quality_issues");
  const { error } = await issuesTable
    .delete()
    .eq("id", issueId)
    .eq("organization_id", context.organizationId)
    .eq("project_id", context.projectId);
  if (error) {
    throw new Error(error.message);
  }
}

export async function createIssueComment(
  supabase: any,
  context: ProjectContext,
  session: { id?: string | null; name?: string | null },
  issueId: string,
  comment: string
) {
  const commentsTable = (supabase as any).from("project_quality_issue_comments");
  const { data, error } = await commentsTable
    .insert({
      organization_id: context.organizationId,
      project_id: context.projectId,
      issue_id: issueId,
      created_by: session.id,
      author_name: session.name ?? "",
      comment,
    })
    .select("id, issue_id, author_name, comment, created_at")
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  return data;
}

export async function createInspection(
  supabase: any,
  context: ProjectContext,
  session: { id?: string | null },
  payload: {
    title: string;
    trade: string;
    location: string;
    assigneeUserId: string;
    assigneeName: string;
    dueDate: string;
    templateName: string;
    scheduledAtIso: string;
  }
) {
  const inspectionsTable = (supabase as any).from("project_quality_inspections");
  const { data, error } = await inspectionsTable
    .insert({
      organization_id: context.organizationId,
      project_id: context.projectId,
      created_by: session.id,
      title: payload.title.trim(),
      trade: payload.trade.trim(),
      location: payload.location.trim(),
      assignee_name: payload.assigneeUserId ? payload.assigneeName : "",
      assignee_user_id: payload.assigneeUserId || null,
      due_date: payload.dueDate || null,
      template_name: payload.templateName,
      scheduled_at: payload.scheduledAtIso,
    })
    .select("id, title, trade, location, assignee_name, assignee_user_id, due_date, template_name, scheduled_at")
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  return data;
}

export async function updateInspection(supabase: any, context: ProjectContext, inspectionId: string, dbPatch: Record<string, unknown>) {
  const inspectionsTable = (supabase as any).from("project_quality_inspections");
  const { error } = await inspectionsTable
    .update(dbPatch)
    .eq("id", inspectionId)
    .eq("organization_id", context.organizationId)
    .eq("project_id", context.projectId);
  if (error) {
    throw new Error(error.message);
  }
}

export async function createInspectionItems(
  supabase: any,
  context: ProjectContext,
  session: { id?: string | null },
  inspectionId: string,
  labels: string[]
) {
  const itemsTable = (supabase as any).from("project_quality_inspection_items");
  const { data, error } = await itemsTable
    .insert(
      labels.map((label) => ({
        organization_id: context.organizationId,
        project_id: context.projectId,
        inspection_id: inspectionId,
        created_by: session.id,
        label,
        status: null,
        notes: "",
        photo_url: "",
      }))
    )
    .select("id, label, status, notes, photo_url, photo_storage_path");
  if (error) {
    throw new Error(error.message);
  }
  return data ?? [];
}

export async function createInspectionItem(
  supabase: any,
  context: ProjectContext,
  session: { id?: string | null },
  inspectionId: string,
  label: string
) {
  const itemsTable = (supabase as any).from("project_quality_inspection_items");
  const { data, error } = await itemsTable
    .insert({
      organization_id: context.organizationId,
      project_id: context.projectId,
      inspection_id: inspectionId,
      created_by: session.id,
      label,
      status: null,
      notes: "",
      photo_url: "",
    })
    .select("id, label, status, notes, photo_url, photo_storage_path")
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  return data;
}

export async function updateInspectionItem(supabase: any, context: ProjectContext, itemId: string, dbPatch: Record<string, unknown>) {
  const itemsTable = (supabase as any).from("project_quality_inspection_items");
  const { error } = await itemsTable
    .update(dbPatch)
    .eq("id", itemId)
    .eq("organization_id", context.organizationId)
    .eq("project_id", context.projectId);
  if (error) {
    throw new Error(error.message);
  }
}

export async function createPhoto(
  supabase: any,
  context: ProjectContext,
  session: { id?: string | null; name?: string | null },
  payload: QualityPhotoInsertPayload
) {
  const photosTable = (supabase as any).from("project_quality_photos");
  const { data, error } = await photosTable
    .insert({
      organization_id: context.organizationId,
      project_id: context.projectId,
      created_by: session.id,
      uploaded_by_user_id: session.id,
      uploaded_by_name: session.name ?? "",
      photo_url: payload.storagePath || payload.photoUrl,
      storage_path: payload.storagePath || null,
      title: payload.title,
      notes: payload.notes,
      trade: payload.trade,
      location: payload.location,
      photo_type: payload.photoType,
      category: payload.category,
      status_tag: payload.statusTag,
      phase_tag: payload.phaseTag || null,
      assigned_user_id: payload.assignedUserId,
      assigned_user_name: payload.assignedUserName,
      has_signoff_evidence: payload.hasSignoffEvidence,
      captured_at: payload.capturedAtIso,
      linked_issue_id: payload.linkedIssueId,
      linked_inspection_id: payload.linkedInspectionId,
      linked_inspection_item_id: payload.linkedInspectionItemId,
    })
    .select(
      "id, title, notes, photo_url, storage_path, trade, location, photo_type, category, status_tag, phase_tag, assigned_user_id, assigned_user_name, has_signoff_evidence, captured_at, uploaded_by_name, uploaded_by_user_id, linked_issue_id, linked_inspection_id, linked_inspection_item_id, created_at"
    )
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  return data;
}

export async function mapInsertedPhoto(supabase: any, data: Record<string, unknown>): Promise<QualityPhoto> {
  return {
    id: String(data.id),
    title: String(data.title ?? ""),
    notes: String(data.notes ?? ""),
    photoUrl: await getQualityPhotoSignedUrl(
      supabase,
      typeof data.storage_path === "string" ? data.storage_path : String(data.photo_url ?? "")
    ),
    trade: String(data.trade ?? ""),
    location: String(data.location ?? ""),
    photoType: normalizePhotoType(data.photo_type),
    category: String(data.category ?? "Progress"),
    statusTag: String(data.status_tag ?? ""),
    phaseTag: normalizePhotoPhase(data.phase_tag),
    assignedUserId: typeof data.assigned_user_id === "string" ? data.assigned_user_id : null,
    assignedUserName: String(data.assigned_user_name ?? ""),
    hasSignoffEvidence: Boolean(data.has_signoff_evidence),
    capturedAt: typeof data.captured_at === "string" ? data.captured_at : new Date().toISOString(),
    uploadedByName: String(data.uploaded_by_name ?? ""),
    uploadedByUserId: typeof data.uploaded_by_user_id === "string" ? data.uploaded_by_user_id : null,
    linkedIssueId: typeof data.linked_issue_id === "string" ? data.linked_issue_id : null,
    linkedInspectionId: typeof data.linked_inspection_id === "string" ? data.linked_inspection_id : null,
    linkedInspectionItemId: typeof data.linked_inspection_item_id === "string" ? data.linked_inspection_item_id : null,
    storagePath: typeof data.storage_path === "string" ? data.storage_path : null,
    createdAt: typeof data.created_at === "string" ? data.created_at : new Date().toISOString(),
  };
}

export async function updatePhoto(supabase: any, context: ProjectContext, photoId: string, dbPatch: Record<string, unknown>) {
  const photosTable = (supabase as any).from("project_quality_photos");
  const { error } = await photosTable
    .update(dbPatch)
    .eq("id", photoId)
    .eq("organization_id", context.organizationId)
    .eq("project_id", context.projectId);
  if (error) {
    throw new Error(error.message);
  }
}

export async function deletePhotoRecord(supabase: any, context: ProjectContext, photoId: string) {
  const photosTable = (supabase as any).from("project_quality_photos");
  const { error } = await photosTable
    .delete()
    .eq("id", photoId)
    .eq("organization_id", context.organizationId)
    .eq("project_id", context.projectId);
  if (error) {
    throw new Error(error.message);
  }
}

export async function createSignOff(
  supabase: any,
  context: ProjectContext,
  session: { id?: string | null },
  payload: {
    title: string;
    type: SignOffType;
    trade: string;
    location: string;
    assigneeUserId: string;
    assigneeName: string;
    dueDate: string;
    linkedInspectionId: string;
    linkedIssueId: string;
    note: string;
  }
) {
  const signOffsTable = (supabase as any).from("project_quality_sign_offs");
  const { data, error } = await signOffsTable
    .insert({
      organization_id: context.organizationId,
      project_id: context.projectId,
      created_by: session.id,
      title: payload.title.trim(),
      signoff_type: payload.type,
      trade: payload.trade.trim(),
      location: payload.location.trim(),
      assignee_name: payload.assigneeUserId ? payload.assigneeName : "",
      assignee_user_id: payload.assigneeUserId || null,
      due_date: payload.dueDate || null,
      linked_inspection_id: payload.linkedInspectionId || null,
      linked_issue_id: payload.linkedIssueId || null,
      note: payload.note.trim(),
      status: "Pending",
    })
    .select("id, title, signoff_type, trade, location, assignee_name, assignee_user_id, due_date, linked_inspection_id, linked_issue_id, note, status, signed_by_name, signed_at, created_at")
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  return data;
}

export async function updateSignOff(supabase: any, context: ProjectContext, signoffId: string, dbPatch: Record<string, unknown>) {
  const signOffsTable = (supabase as any).from("project_quality_sign_offs");
  const { error } = await signOffsTable
    .update(dbPatch)
    .eq("id", signoffId)
    .eq("organization_id", context.organizationId)
    .eq("project_id", context.projectId);
  if (error) {
    throw new Error(error.message);
  }
}

export async function signOff(
  supabase: any,
  context: ProjectContext,
  session: { name?: string | null },
  signoffId: string,
  status: SignOffStatus,
  note: string
) {
  const signOffsTable = (supabase as any).from("project_quality_sign_offs");
  const { error } = await signOffsTable
    .update({
      status,
      requested_at: status === "Requested" ? new Date().toISOString() : null,
      signed_by_name: session?.name ?? null,
      signed_at: status === "Signed" ? new Date().toISOString() : null,
      note: note.trim(),
    })
    .eq("id", signoffId)
    .eq("organization_id", context.organizationId)
    .eq("project_id", context.projectId);
  if (error) {
    throw new Error(error.message);
  }
}

export const rejectSignOff = signOff;
