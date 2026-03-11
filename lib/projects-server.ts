import "server-only";

import { cache } from "react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

const memberSelect = "id, organization_id, user_id, role, display_name, avatar_path, created_at, updated_at";
const projectSelect =
  "id, organization_id, created_by, name, slug, stage, location, cover_image_url, created_at, updated_at";
const projectDrawingSetSelect =
  "id, organization_id, project_id, uploaded_by, file_name, storage_path, file_size_bytes, mime_type, uploaded_at, created_at, updated_at";
const projectTradePackPageIndexSelect = "id, trade_label, include_in_pack, is_support_sheet, created_at, run_id";

type OrganizationMember = Database["public"]["Tables"]["organization_members"]["Row"];
type OrganizationProject = Database["public"]["Tables"]["organization_projects"]["Row"];
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

const GENERATED_PACK_FILTER =
  "file_name.ilike.%trade pack%,file_name.ilike.%-trade-pack.pdf,storage_path.ilike.%-trade-pack.pdf";

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

  return data ?? [];
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
      .from("project_drawing_sets")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", member.organization_id)
      .eq("project_id", projectId)
      .or(GENERATED_PACK_FILTER),
    supabase
      .from("project_drawing_sets")
      .select("file_name, uploaded_at")
      .eq("organization_id", member.organization_id)
      .eq("project_id", projectId)
      .or(GENERATED_PACK_FILTER)
      .order("uploaded_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
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
  const latestIndexEntry = latestIndexEntryResult.error ? null : latestIndexEntryResult.data;

  return {
    totalDrawingSets,
    sourceDrawingSets,
    generatedTradePacks,
    latestGeneratedPackName: latestGeneratedPack?.file_name ?? null,
    latestGeneratedPackUploadedAt: latestGeneratedPack?.uploaded_at ?? null,
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

  const projects = projectsResult.error ? [] : (projectsResult.data ?? []);
  const drawingSets = drawingSetsResult.error ? [] : (drawingSetsResult.data ?? []);
  const projectsById = new Map(projects.map((project) => [project.id, project]));

  const projectItems: RecentActivityItem[] = projects.map((project) => ({
    id: `project-${project.id}`,
    label: `Trade Pack Workspace created - ${project.name}`,
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
        /trade pack/i.test(drawingSet.file_name ?? "") ||
        /-trade-pack\.pdf$/i.test(drawingSet.file_name ?? "") ||
        /-trade-pack\.pdf$/i.test(drawingSet.storage_path ?? "");

      return {
        id: `drawing-set-${drawingSet.id}`,
        label: `${isGeneratedPack ? "Trade pack generated" : "Plans uploaded"} - ${project.name}`,
        href: `/app/projects/${project.slug}/drawing-intelligence`,
        occurredAt: drawingSet.uploaded_at,
      } satisfies RecentActivityItem;
    })
    .filter((item): item is RecentActivityItem => item !== null);

  return [...projectItems, ...drawingSetItems]
    .sort((left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime())
    .slice(0, limit);
}
