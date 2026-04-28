import "server-only";

import { cache } from "react";
import type { OrganizationProject } from "@/lib/projects";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

const memberSelect = "id, organization_id, user_id, role, display_name, avatar_path, created_at, updated_at";
const projectSelect =
  "id, organization_id, created_by, client_id, source_opportunity_id, name, slug, project_code, stage, location, cover_image_url, created_at, updated_at";
const projectDrawingSetSelect =
  "id, organization_id, project_id, uploaded_by, file_name, storage_path, file_size_bytes, mime_type, uploaded_at, created_at, updated_at";
const projectTradePackPageIndexSelect = "id, trade_label, include_in_pack, is_support_sheet, created_at, run_id";

type OrganizationMember = Database["public"]["Tables"]["organization_members"]["Row"];
type ProjectDrawingSet = Database["public"]["Tables"]["project_drawing_sets"]["Row"];

export interface ProjectDashboardMetrics {
  totalDrawingSets: number;
  sourceDrawingSets: number;
  generatedTradePacks: number;
  latestGeneratedPackName: string | null;
  latestGeneratedPackUploadedAt: string | null;
  indexedPages: number;
  includedPages: number;
  supportPages: number;
  latestTradeLabel: string | null;
  latestClassifiedAt: string | null;
}

export interface RecentActivityItem {
  id: string;
  label: string;
  href: string;
  occurredAt: string;
}

function isGeneratedTradePackFile(fileName: string | null, storagePath: string | null): boolean {
  return /trade pack/i.test(fileName ?? "") || /-trade-pack\.pdf$/i.test(fileName ?? "") || /-trade-pack\.pdf$/i.test(storagePath ?? "");
}

export const getCurrentOrganizationMember = cache(async (): Promise<OrganizationMember | null> => {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data, error } = await supabase
    .from("organization_members")
    .select(memberSelect)
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    return null;
  }

  return data ?? null;
});

async function getHiddenWorkspaceProjectIds(organizationId: string, candidateProjectIds?: string[]): Promise<Set<string>> {
  const supabase = await createServerSupabaseClient();
  const baseQuery = supabase
    .from("organization_opportunities")
    .select("workspace_project_id")
    .eq("organization_id", organizationId)
    .not("workspace_project_id", "is", null);

  const scopedQuery =
    candidateProjectIds && candidateProjectIds.length > 0
      ? baseQuery.in("workspace_project_id", candidateProjectIds)
      : baseQuery;

  const { data, error } = await scopedQuery;

  if (error) {
    return new Set();
  }

  return new Set((data ?? []).map((row) => row.workspace_project_id).filter((value): value is string => Boolean(value)));
}

export async function getOrganizationProjectsForCurrentUser(): Promise<OrganizationProject[]> {
  const member = await getCurrentOrganizationMember();

  if (!member) {
    return [];
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("organization_projects")
    .select(projectSelect)
    .eq("organization_id", member.organization_id)
    .order("created_at", { ascending: false });

  if (error) {
    return [];
  }

  const projects = data ?? [];
  if (projects.length === 0) {
    return [];
  }

  const hiddenWorkspaceProjectIds = await getHiddenWorkspaceProjectIds(
    member.organization_id,
    projects.map((project) => project.id)
  );
  const visibleProjects = projects.filter((project) => !hiddenWorkspaceProjectIds.has(project.id));

  const clientIds = Array.from(
    new Set(
      visibleProjects
        .map((project) => project.client_id)
        .filter((value): value is string => Boolean(value))
    )
  );

  const clientsResult =
    clientIds.length > 0
      ? await supabase.from("organization_clients").select("id, company_name").eq("organization_id", member.organization_id).in("id", clientIds)
      : { data: [], error: null };

  const clientNameById = new Map((clientsResult.data ?? []).map((client) => [client.id, client.company_name ?? "Unknown Company"]));

  return visibleProjects.map((project) => {
    return {
      ...project,
      client_name: project.client_id ? clientNameById.get(project.client_id) ?? null : null,
    } satisfies OrganizationProject;
  });
}

export async function getOrganizationProjectBySlugForCurrentUser(
  projectSlug: string
): Promise<OrganizationProject | null> {
  const member = await getCurrentOrganizationMember();

  if (!member) {
    return null;
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("organization_projects")
    .select(projectSelect)
    .eq("organization_id", member.organization_id)
    .eq("slug", projectSlug)
    .limit(1)
    .maybeSingle();

  if (error) {
    return null;
  }

  return data ?? null;
}

export async function getOrganizationProjectByIdForCurrentUser(
  projectId: string
): Promise<OrganizationProject | null> {
  const member = await getCurrentOrganizationMember();

  if (!member) {
    return null;
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("organization_projects")
    .select(projectSelect)
    .eq("organization_id", member.organization_id)
    .eq("id", projectId)
    .limit(1)
    .maybeSingle();

  if (error) {
    return null;
  }

  return data ?? null;
}

export async function getProjectDrawingSetsForCurrentUser(projectId: string): Promise<ProjectDrawingSet[]> {
  const member = await getCurrentOrganizationMember();

  if (!member) {
    return [];
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("project_drawing_sets")
    .select(projectDrawingSetSelect)
    .eq("organization_id", member.organization_id)
    .eq("project_id", projectId)
    .order("uploaded_at", { ascending: false });

  if (error) {
    return [];
  }

  return data ?? [];
}

export async function getProjectDashboardMetricsForCurrentUser(projectId: string): Promise<ProjectDashboardMetrics> {
  const member = await getCurrentOrganizationMember();

  if (!member) {
    return {
      totalDrawingSets: 0,
      sourceDrawingSets: 0,
      generatedTradePacks: 0,
      latestGeneratedPackName: null,
      latestGeneratedPackUploadedAt: null,
      indexedPages: 0,
      includedPages: 0,
      supportPages: 0,
      latestTradeLabel: null,
      latestClassifiedAt: null,
    };
  }

  const supabase = await createServerSupabaseClient();

  const [
    totalDrawingSetsResult,
    generatedTradePacksResult,
    latestGeneratedPackResult,
    latestGeneratedPackDrawingSetResult,
    indexedPagesResult,
    includedPagesResult,
    supportPagesResult,
    latestIndexEntryResult,
  ] = await Promise.all([
    supabase
      .from("project_drawing_sets")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", member.organization_id)
      .eq("project_id", projectId),
    supabase
      .from("trade_packs")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", member.organization_id)
      .eq("project_id", projectId),
    supabase
      .from("trade_packs")
      .select("id, trade_label, created_at")
      .eq("organization_id", member.organization_id)
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("project_drawing_sets")
      .select("id, file_name, uploaded_at")
      .eq("organization_id", member.organization_id)
      .eq("project_id", projectId)
      .order("uploaded_at", { ascending: false })
      .limit(200),
    supabase
      .from("project_trade_pack_page_index")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", member.organization_id)
      .eq("project_id", projectId),
    supabase
      .from("project_trade_pack_page_index")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", member.organization_id)
      .eq("project_id", projectId)
      .eq("include_in_pack", true),
    supabase
      .from("project_trade_pack_page_index")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", member.organization_id)
      .eq("project_id", projectId)
      .eq("is_support_sheet", true),
    supabase
      .from("project_trade_pack_page_index")
      .select(projectTradePackPageIndexSelect)
      .eq("organization_id", member.organization_id)
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const totalDrawingSets = totalDrawingSetsResult.error ? 0 : (totalDrawingSetsResult.count ?? 0);
  const generatedTradePacks = generatedTradePacksResult.error ? 0 : (generatedTradePacksResult.count ?? 0);
  const sourceDrawingSets = Math.max(0, totalDrawingSets - generatedTradePacks);
  const indexedPages = indexedPagesResult.error ? 0 : (indexedPagesResult.count ?? 0);
  const includedPages = includedPagesResult.error ? 0 : (includedPagesResult.count ?? 0);
  const supportPages = supportPagesResult.error ? 0 : (supportPagesResult.count ?? 0);
  const latestGeneratedPack = latestGeneratedPackResult.error ? null : latestGeneratedPackResult.data;
  const latestGeneratedPackDrawingSet =
    latestGeneratedPackDrawingSetResult.error || !latestGeneratedPack?.id
      ? null
      : (latestGeneratedPackDrawingSetResult.data ?? []).find((row) => row.id === latestGeneratedPack.id) ?? null;
  const latestIndexEntry = latestIndexEntryResult.error ? null : latestIndexEntryResult.data;

  return {
    totalDrawingSets,
    sourceDrawingSets,
    generatedTradePacks,
    latestGeneratedPackName: latestGeneratedPackDrawingSet?.file_name ?? latestGeneratedPack?.trade_label ?? null,
    latestGeneratedPackUploadedAt: latestGeneratedPackDrawingSet?.uploaded_at ?? latestGeneratedPack?.created_at ?? null,
    indexedPages,
    includedPages,
    supportPages,
    latestTradeLabel: latestIndexEntry?.trade_label ?? null,
    latestClassifiedAt: latestIndexEntry?.created_at ?? null,
  };
}

export async function getRecentActivityForCurrentUser(limit = 6): Promise<RecentActivityItem[]> {
  const member = await getCurrentOrganizationMember();

  if (!member) {
    return [];
  }

  const supabase = await createServerSupabaseClient();
  const [projectsResult, drawingSetsResult] = await Promise.all([
    supabase
      .from("organization_projects")
      .select(projectSelect)
      .eq("organization_id", member.organization_id)
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("project_drawing_sets")
      .select(projectDrawingSetSelect)
      .eq("organization_id", member.organization_id)
      .order("uploaded_at", { ascending: false })
      .limit(limit),
  ]);

  const hiddenWorkspaceProjectIds = await getHiddenWorkspaceProjectIds(member.organization_id);
  const projects = (projectsResult.error ? [] : (projectsResult.data ?? [])).filter((project) => !hiddenWorkspaceProjectIds.has(project.id));
  const drawingSets = (drawingSetsResult.error ? [] : (drawingSetsResult.data ?? [])).filter(
    (drawingSet) => !hiddenWorkspaceProjectIds.has(drawingSet.project_id)
  );
  const projectsById = new Map(projects.map((project) => [project.id, project]));

  const projectItems: RecentActivityItem[] = projects.map((project) => ({
    id: `project-${project.id}`,
    label: `Project created - ${project.name}`,
    href: `/app/projects/${project.slug}/dashboard`,
    occurredAt: project.created_at,
  }));

  const drawingSetItems: RecentActivityItem[] = drawingSets
    .map((drawingSet) => {
      const project = projectsById.get(drawingSet.project_id);
      if (!project) {
        return null;
      }

      const isGeneratedPack =
        isGeneratedTradePackFile(drawingSet.file_name, drawingSet.storage_path);

      return {
        id: `drawing-set-${drawingSet.id}`,
        label: `${isGeneratedPack ? "Trade pack generated" : "Plans uploaded"} - ${project.name}`,
        href: `/app/projects/${project.slug}/dashboard`,
        occurredAt: drawingSet.uploaded_at,
      } satisfies RecentActivityItem;
    })
    .filter((item): item is RecentActivityItem => item !== null);

  return [...projectItems, ...drawingSetItems]
    .sort((left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime())
    .slice(0, limit);
}
