/* eslint-disable @typescript-eslint/no-explicit-any */

import { QUALITY_PHOTOS_BUCKET } from "@/lib/quality-assurance/constants";
import {
  isLegacySeedInspectionTitle,
  isLegacySeedIssueTitle,
  isLegacySeedSignOffTitle,
  looksLikeStoragePath,
  normalizePhotoPhase,
  normalizePhotoType,
  normalizeSourceType,
} from "@/lib/quality-assurance/helpers";
import { getQualityPhotoSignedUrl } from "@/lib/quality-assurance/storage";
import type {
  ChecklistStatus,
  LinkedTask,
  OrganizationUserOption,
  ProjectContext,
  QualityCoreDataResult,
  QualityInspection,
  QualityIssue,
  QualityIssueThreadResult,
  QualityPhoto,
  QualitySignOff,
  QualitySignoffThreadResult,
  QualityInspectionThreadResult,
  SignOffStatus,
} from "@/lib/quality-assurance/types";

async function createQualityPhotoSignedUrlMap(supabase: any, paths: string[]): Promise<Map<string, string>> {
  const urlMap = new Map<string, string>();
  const uniquePaths = [...new Set(paths.filter(Boolean))];

  if (uniquePaths.length === 0) {
    return urlMap;
  }

  const storageBucket = supabase?.storage?.from?.(QUALITY_PHOTOS_BUCKET);
  const createSignedUrls = storageBucket?.createSignedUrls;

  if (typeof createSignedUrls === "function") {
    const { data, error } = await createSignedUrls.call(storageBucket, uniquePaths, 60 * 60);
    if (!error && Array.isArray(data)) {
      for (let index = 0; index < uniquePaths.length; index += 1) {
        const path = uniquePaths[index];
        const signedUrl = typeof data[index]?.signedUrl === "string" ? data[index].signedUrl : null;
        urlMap.set(path, signedUrl || path);
      }
      return urlMap;
    }
  }

  await Promise.all(
    uniquePaths.map(async (path) => {
      urlMap.set(path, await getQualityPhotoSignedUrl(supabase, path));
    })
  );

  return urlMap;
}

export async function resolveProjectContext(supabase: any, session: { id?: string | null; organizationId?: string | null }) {
  if (!supabase || !session?.id) {
    throw new Error("Session not ready.");
  }
  let resolvedOrganizationId = session.organizationId ?? null;
  if (!resolvedOrganizationId) {
    const { data: ensuredOrganizationId } = await supabase.rpc("ensure_organization_membership");
    resolvedOrganizationId = ensuredOrganizationId ?? null;
  }
  if (!resolvedOrganizationId) {
    throw new Error("Could not resolve your organization.");
  }
  return resolvedOrganizationId;
}

export async function resolveQualityProjectContext(
  supabase: any,
  session: { id?: string | null; organizationId?: string | null },
  routeProjectSlug: string
): Promise<ProjectContext> {
  const organizationId = await resolveProjectContext(supabase, session);
  const { data: projectRow, error: projectError } = await supabase
    .from("organization_projects")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("slug", routeProjectSlug)
    .maybeSingle();

  if (projectError || !projectRow) {
    throw new Error(projectError?.message ?? "Project not found.");
  }

  return {
    organizationId,
    projectId: String(projectRow.id),
  };
}

export async function listQualityIssues(supabase: any, context: ProjectContext): Promise<QualityIssue[]> {
  const issuesTable = (supabase as any).from("project_quality_issues");
  const { data, error } = await issuesTable
    .select("id, title, description, trade, location, priority, status, due_date, assignee_name, assignee_user_id, updated_at")
    .eq("organization_id", context.organizationId)
    .eq("project_id", context.projectId)
    .order("created_at", { ascending: false })
    .limit(400);

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as Array<Record<string, unknown>>)
    .map((row): QualityIssue => ({
      id: String(row.id),
      title: String(row.title ?? ""),
      description: String(row.description ?? ""),
      trade: String(row.trade ?? ""),
      location: String(row.location ?? ""),
      priority: (
        row.priority === "Low"
          ? "Low"
          : row.priority === "High"
            ? "High"
            : row.priority === "Medium"
              ? "Medium"
              : "Medium"
      ) as QualityIssue["priority"],
      status: (row.status as QualityIssue["status"]) ?? "Open",
      dueDate: typeof row.due_date === "string" ? row.due_date : null,
      assignee: String(row.assignee_name ?? ""),
      assigneeUserId: typeof row.assignee_user_id === "string" ? row.assignee_user_id : null,
      updatedAt: typeof row.updated_at === "string" ? row.updated_at : new Date().toISOString(),
    }))
    .filter((row) => !isLegacySeedIssueTitle(row.title));
}

export async function listQualityInspections(supabase: any, context: ProjectContext): Promise<QualityInspection[]> {
  const inspectionsTable = (supabase as any).from("project_quality_inspections");
  const { data, error } = await inspectionsTable
    .select(
      "id, title, trade, location, assignee_name, assignee_user_id, due_date, template_name, scheduled_at, project_quality_inspection_items(id, label, status, notes, photo_url, photo_storage_path)"
    )
    .eq("organization_id", context.organizationId)
    .eq("project_id", context.projectId)
    .order("scheduled_at", { ascending: true })
    .limit(200);

  if (error) {
    throw new Error(error.message);
  }

  const normalized = ((data ?? []) as Array<Record<string, unknown>>)
    .map((row) => {
      const nestedItems = Array.isArray(row.project_quality_inspection_items)
        ? (row.project_quality_inspection_items as Array<Record<string, unknown>>)
        : [];
      return {
        id: String(row.id),
        title: String(row.title ?? ""),
        trade: String(row.trade ?? ""),
        location: String(row.location ?? ""),
        assignee: String(row.assignee_name ?? ""),
        assigneeUserId: typeof row.assignee_user_id === "string" ? row.assignee_user_id : null,
        dueDate: typeof row.due_date === "string" ? row.due_date : null,
        templateName: String(row.template_name ?? ""),
        scheduledAt: typeof row.scheduled_at === "string" ? row.scheduled_at : new Date().toISOString(),
        items: nestedItems.map((item) => ({
          id: String(item.id),
          label: String(item.label ?? ""),
          status: (item.status as ChecklistStatus) ?? null,
          notes: String(item.notes ?? ""),
          photoUrl: String(item.photo_url ?? ""),
          photoStoragePath: typeof item.photo_storage_path === "string" ? item.photo_storage_path : null,
        })),
      };
    })
    .filter((row) => !isLegacySeedInspectionTitle(row.title));

  const inspectionPhotoPaths = normalized
    .flatMap((inspection) =>
      inspection.items.map((item) => item.photoStoragePath ?? (looksLikeStoragePath(item.photoUrl) ? item.photoUrl : null))
    )
    .filter((path): path is string => Boolean(path));
  const inspectionPhotoUrlMap = await createQualityPhotoSignedUrlMap(supabase, inspectionPhotoPaths);

  return normalized.map((inspection) => ({
    ...inspection,
    items: inspection.items.map((item) => {
      const storedPath = item.photoStoragePath ?? (looksLikeStoragePath(item.photoUrl) ? item.photoUrl : null);
      return {
        ...item,
        photoStoragePath: storedPath,
        photoUrl: storedPath ? inspectionPhotoUrlMap.get(storedPath) ?? item.photoUrl : item.photoUrl,
      };
    }),
  }));
}

export async function listQualitySignOffs(supabase: any, context: ProjectContext): Promise<QualitySignOff[]> {
  const signOffsTable = (supabase as any).from("project_quality_sign_offs");
  const { data, error } = await signOffsTable
    .select(
      "id, title, signoff_type, trade, location, assignee_name, assignee_user_id, due_date, linked_inspection_id, linked_issue_id, note, status, signed_by_name, signed_at, created_at"
    )
    .eq("organization_id", context.organizationId)
    .eq("project_id", context.projectId)
    .order("created_at", { ascending: true })
    .limit(50);

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as Array<Record<string, unknown>>)
    .map((row): QualitySignOff => ({
      id: String(row.id),
      title: String(row.title ?? ""),
      type: (
        row.signoff_type === "Client"
          ? "Client"
          : row.signoff_type === "Council"
            ? "Council"
            : row.signoff_type === "Final Handover"
              ? "Final Handover"
              : "Internal"
      ) as QualitySignOff["type"],
      trade: String(row.trade ?? ""),
      location: String(row.location ?? ""),
      assignee: String(row.assignee_name ?? ""),
      assigneeUserId: typeof row.assignee_user_id === "string" ? row.assignee_user_id : null,
      dueDate: typeof row.due_date === "string" ? row.due_date : null,
      linkedInspectionId: typeof row.linked_inspection_id === "string" ? row.linked_inspection_id : null,
      linkedIssueId: typeof row.linked_issue_id === "string" ? row.linked_issue_id : null,
      note: String(row.note ?? ""),
      status: (row.status as SignOffStatus) ?? "Pending",
      signedBy: typeof row.signed_by_name === "string" ? row.signed_by_name : null,
      signedAt: typeof row.signed_at === "string" ? row.signed_at : null,
      createdAt: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
    }))
    .filter((row) => !isLegacySeedSignOffTitle(row.title));
}

export async function listLinkedTasks(supabase: any, context: ProjectContext): Promise<LinkedTask[]> {
  const todosTable = (supabase as any).from("project_job_todos");
  const { data, error } = await todosTable
    .select("id, title, source_type, is_completed")
    .eq("organization_id", context.organizationId)
    .eq("project_id", context.projectId)
    .not("source_type", "is", null)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    title: String(row.title ?? ""),
    source_type: normalizeSourceType(row.source_type),
    is_completed: Boolean(row.is_completed),
  }));
}

export async function listProjectMembers(
  supabase: any,
  context: ProjectContext,
  session: { id?: string | null; name?: string | null }
): Promise<OrganizationUserOption[]> {
  const membersTable = (supabase as any).from("organization_members");
  const { data, error } = await membersTable
    .select("user_id, display_name")
    .eq("organization_id", context.organizationId)
    .order("display_name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as Array<Record<string, unknown>>)
    .map((row) => ({
      userId: String(row.user_id ?? ""),
      name: String(row.display_name ?? "").trim(),
    }))
    .filter((row) => row.userId.length > 0)
    .map((row) => ({ ...row, name: row.name || (row.userId === session.id ? session.name ?? "You" : "Team Member") }));
}

export async function listQualityPhotos(supabase: any, context: ProjectContext): Promise<QualityPhoto[]> {
  const photosTable = (supabase as any).from("project_quality_photos");
  const { data, error } = await photosTable
    .select(
      "id, title, notes, photo_url, storage_path, trade, location, photo_type, category, status_tag, phase_tag, assigned_user_id, assigned_user_name, has_signoff_evidence, captured_at, uploaded_by_name, uploaded_by_user_id, linked_issue_id, linked_inspection_id, linked_inspection_item_id, created_at"
    )
    .eq("organization_id", context.organizationId)
    .eq("project_id", context.projectId)
    .order("captured_at", { ascending: false })
    .limit(1000);

  if (error) {
    throw new Error(error.message);
  }

  const normalizedBase = ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    title: String(row.title ?? ""),
    notes: String(row.notes ?? ""),
    photoUrl: String(row.photo_url ?? ""),
    trade: String(row.trade ?? ""),
    location: String(row.location ?? ""),
    photoType: normalizePhotoType(row.photo_type),
    category: String(row.category ?? "Progress"),
    statusTag: String(row.status_tag ?? ""),
    phaseTag: normalizePhotoPhase(row.phase_tag),
    assignedUserId: typeof row.assigned_user_id === "string" ? row.assigned_user_id : null,
    assignedUserName: String(row.assigned_user_name ?? ""),
    hasSignoffEvidence: Boolean(row.has_signoff_evidence),
    capturedAt: typeof row.captured_at === "string" ? row.captured_at : new Date().toISOString(),
    uploadedByName: String(row.uploaded_by_name ?? ""),
    uploadedByUserId: typeof row.uploaded_by_user_id === "string" ? row.uploaded_by_user_id : null,
    linkedIssueId: typeof row.linked_issue_id === "string" ? row.linked_issue_id : null,
    linkedInspectionId: typeof row.linked_inspection_id === "string" ? row.linked_inspection_id : null,
    linkedInspectionItemId: typeof row.linked_inspection_item_id === "string" ? row.linked_inspection_item_id : null,
    storagePath: typeof row.storage_path === "string" ? row.storage_path : null,
    createdAt: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
  }));

  const storagePaths = normalizedBase
    .map((row) => row.storagePath ?? (looksLikeStoragePath(row.photoUrl) ? row.photoUrl : null))
    .filter((path): path is string => Boolean(path));
  const storageUrlMap = await createQualityPhotoSignedUrlMap(supabase, storagePaths);

  return normalizedBase.map((row) => {
    const storedPath = row.storagePath ?? (looksLikeStoragePath(row.photoUrl) ? row.photoUrl : null);
    return {
      ...row,
      storagePath: storedPath,
      photoUrl: storedPath ? storageUrlMap.get(storedPath) ?? row.photoUrl : row.photoUrl,
    };
  });
}

export async function listQualityCoreData(
  supabase: any,
  session: { id?: string | null; organizationId?: string | null; name?: string | null },
  routeProjectSlug: string
): Promise<QualityCoreDataResult> {
  const context = await resolveQualityProjectContext(supabase, session, routeProjectSlug);
  const [issues, inspections, signOffs, todoLinks, organizationUsers] = await Promise.all([
    listQualityIssues(supabase, context),
    listQualityInspections(supabase, context),
    listQualitySignOffs(supabase, context),
    listLinkedTasks(supabase, context),
    listProjectMembers(supabase, context, session),
  ]);

  return {
    context,
    issues,
    inspections,
    signOffs,
    todoLinks,
    organizationUsers,
  };
}

export async function listQualityIssueThread(supabase: any, context: ProjectContext, issueId: string): Promise<QualityIssueThreadResult> {
  const commentsTable = (supabase as any).from("project_quality_issue_comments");
  const activityTable = (supabase as any).from("project_quality_issue_activity");

  const [commentsResult, activityResult] = await Promise.all([
    commentsTable
      .select("id, issue_id, author_name, comment, created_at")
      .eq("organization_id", context.organizationId)
      .eq("project_id", context.projectId)
      .eq("issue_id", issueId)
      .order("created_at", { ascending: true })
      .limit(200),
    activityTable
      .select("id, issue_id, actor_name, action, detail, created_at")
      .eq("organization_id", context.organizationId)
      .eq("project_id", context.projectId)
      .eq("issue_id", issueId)
      .order("created_at", { ascending: true })
      .limit(300),
  ]);

  return {
    comments: commentsResult.error
      ? []
      : ((commentsResult.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
          id: String(row.id),
          issueId: String(row.issue_id),
          authorName: String(row.author_name ?? ""),
          comment: String(row.comment ?? ""),
          createdAt: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
        })),
    activity: activityResult.error
      ? []
      : ((activityResult.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
          id: String(row.id),
          issueId: String(row.issue_id),
          actorName: String(row.actor_name ?? ""),
          action: String(row.action ?? ""),
          detail: String(row.detail ?? ""),
          createdAt: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
        })),
  };
}

export async function listQualityInspectionThread(
  supabase: any,
  context: ProjectContext,
  inspectionId: string
): Promise<QualityInspectionThreadResult> {
  const activityTable = (supabase as any).from("project_quality_inspection_activity");
  const { data, error } = await activityTable
    .select("id, inspection_id, inspection_item_id, actor_name, action, detail, created_at")
    .eq("organization_id", context.organizationId)
    .eq("project_id", context.projectId)
    .eq("inspection_id", inspectionId)
    .order("created_at", { ascending: false })
    .limit(150);

  return {
    activity: error
      ? []
      : ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
          id: String(row.id),
          inspectionId: String(row.inspection_id),
          inspectionItemId: typeof row.inspection_item_id === "string" ? row.inspection_item_id : null,
          actorName: String(row.actor_name ?? ""),
          action: String(row.action ?? ""),
          detail: String(row.detail ?? ""),
          createdAt: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
        })),
  };
}

export async function listQualitySignoffThread(
  supabase: any,
  context: ProjectContext,
  signoffId: string
): Promise<QualitySignoffThreadResult> {
  const activityTable = (supabase as any).from("project_quality_signoff_activity");
  const { data, error } = await activityTable
    .select("id, signoff_id, actor_name, action, detail, created_at")
    .eq("organization_id", context.organizationId)
    .eq("project_id", context.projectId)
    .eq("signoff_id", signoffId)
    .order("created_at", { ascending: false })
    .limit(150);

  return {
    activity: error
      ? []
      : ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
          id: String(row.id),
          signoffId: String(row.signoff_id),
          actorName: String(row.actor_name ?? ""),
          action: String(row.action ?? ""),
          detail: String(row.detail ?? ""),
          createdAt: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
        })),
  };
}
